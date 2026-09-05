#!/usr/bin/env python3
"""
scripts/simulate_streaming.py
------------------------------
Simulates near-real-time audio streaming by chunking an audio file into
fixed-duration segments (e.g. 1000 ms) and streaming them sequentially into
the StreamingAudioPipeline.

IMPORTANT NOTICE:
    This tool simulates streaming audio ingestion (e.g. WebRTC / WebSocket chunks).
    It does NOT directly intercept arbitrary cellular phone calls.

Usage:
    python scripts/simulate_streaming.py --audio path/to/sample.wav
    python scripts/simulate_streaming.py --audio path/to/sample.flac --speaker-id LA_0069
    python scripts/simulate_streaming.py --audio path/to/sample.flac --chunk-ms 500 --no-sleep
"""

import argparse
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np

from backend.audio.decoder import load_audio
from backend.pipeline.streaming_pipeline import (
    StreamingAudioPipeline,
    StreamingConfig,
)
from backend.utils.config import PipelineConfig
from backend.utils.logger import get_logger

log = get_logger("simulate_streaming")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Simulate real-time chunked audio streaming for Voice Clone Detection."
    )
    parser.add_argument(
        "--audio",
        "-a",
        type=str,
        required=True,
        help="Path to the audio file to stream (WAV, FLAC, MP3, etc.).",
    )
    parser.add_argument(
        "--speaker-id",
        "-s",
        type=str,
        default=None,
        help="Enrolled speaker ID for speaker verification (e.g. LA_0069).",
    )
    parser.add_argument(
        "--session-id",
        type=str,
        default=None,
        help="Unique session ID (default: auto-generated based on filename).",
    )
    parser.add_argument(
        "--chunk-ms",
        "-c",
        type=int,
        default=1000,
        help="Chunk duration in milliseconds (default: 1000 ms).",
    )
    parser.add_argument(
        "--no-sleep",
        action="store_true",
        help="Do not sleep to simulate real-time pace; process as fast as possible.",
    )
    parser.add_argument(
        "--max-chunks",
        type=int,
        default=None,
        help="Maximum number of chunks to process.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"Error: Audio file not found at {audio_path}", file=sys.stderr)
        sys.exit(1)

    session_id = args.session_id or f"stream_sim_{audio_path.stem}_{int(time.time())}"
    chunk_ms = args.chunk_ms
    samples_per_chunk = int(16000 * (chunk_ms / 1000.0))

    print("=" * 80)
    print("VOICE CLONE DETECTION — REAL-TIME STREAMING SIMULATOR")
    print("=" * 80)
    print(f"Audio file       : {audio_path}")
    print(f"Session ID       : {session_id}")
    print(f"Speaker ID       : {args.speaker_id or 'None (Verification Skipped)'}")
    print(f"Chunk duration   : {chunk_ms} ms ({samples_per_chunk} samples @ 16kHz)")
    print(f"Pacing           : {'Fast (Benchmark mode)' if args.no_sleep else 'Real-time paced'}")
    print("=" * 80)
    print("NOTICE: Simulating WebRTC/WebSocket chunk ingestion. Cellular audio interception is not claimed.")
    print("=" * 80)

    # 1. Load full audio into 16kHz mono numpy array
    print("\n[1/3] Loading and decoding audio...")
    wav_raw, sr = load_audio(str(audio_path), target_sr=16000)
    if isinstance(wav_raw, np.ndarray):
        waveform = wav_raw
    else:
        waveform = wav_raw.detach().cpu().float().numpy()
    if waveform.ndim > 1:
        waveform = np.squeeze(waveform)
    total_duration_sec = len(waveform) / 16000.0

    print(f"Total audio loaded: {len(waveform)} samples ({total_duration_sec:.2f} s)")

    # 2. Slice into chunks
    num_chunks = int(np.ceil(len(waveform) / samples_per_chunk))
    if args.max_chunks:
        num_chunks = min(num_chunks, args.max_chunks)

    print(f"Total chunks to stream: {num_chunks}")

    # 3. Initialize streaming pipeline
    print("\n[2/3] Initializing StreamingAudioPipeline (models loaded once)...")
    config = StreamingConfig(chunk_duration_ms=chunk_ms)
    streaming_pipeline = StreamingAudioPipeline(config=config)
    session = streaming_pipeline.start_session(session_id, speaker_id=args.speaker_id)

    # 4. Stream chunks
    print("\n[3/3] Streaming audio chunks...")
    header_fmt = "{:<6} | {:<7} | {:<10} | {:<10} | {:<10} | {:<10} | {:<11} | {:<6} | {:<8} | {:<6}"
    row_fmt = "{:<6} | {:<7} | {:<10} | {:<10} | {:<10} | {:<10} | {:<11} | {:<6} | {:<8.1f} | {:<6.3f}"

    print("-" * 105)
    print(header_fmt.format(
        "Chunk", "Speech", "RawSynth", "SmthSynth", "RawSim", "SmthSim", "Verdict", "Alert", "Lat(ms)", "RTF"
    ))
    print("-" * 105)

    stream_start_time = time.time()

    for idx in range(num_chunks):
        start_idx = idx * samples_per_chunk
        end_idx = min(start_idx + samples_per_chunk, len(waveform))
        chunk_data = waveform[start_idx:end_idx]

        # Natural audio chunk (no artificial zero-padding)
        if len(chunk_data) < 160:  # Skip negligible sub-10ms sliver
            continue
        actual_chunk_ms = (len(chunk_data) / 16000.0) * 1000.0

        res = streaming_pipeline.process_chunk(
            session_id=session_id,
            chunk_input=chunk_data,
            chunk_id=idx + 1,
            chunk_duration_ms=actual_chunk_ms,
        )


        speech_str = "YES" if res.speech_detected else "NO"
        raw_synth_str = f"{res.synthetic_probability:.3f}" if res.synthetic_probability is not None else "-"
        smth_synth_str = f"{res.smoothed_synthetic_probability:.3f}" if res.smoothed_synthetic_probability is not None else "-"
        raw_sim_str = f"{res.speaker_similarity:.3f}" if res.speaker_similarity is not None else "-"
        smth_sim_str = f"{res.smoothed_speaker_similarity:.3f}" if res.smoothed_speaker_similarity is not None else "-"
        alert_str = "ALERT!" if res.is_alert else "ok"

        print(row_fmt.format(
            idx + 1,
            speech_str,
            raw_synth_str,
            smth_synth_str,
            raw_sim_str,
            smth_sim_str,
            res.verdict,
            alert_str,
            res.processing_time_ms,
            res.real_time_factor,
        ))

        # Real-time pacing simulation
        if not args.no_sleep:
            elapsed = res.processing_time_ms / 1000.0
            sleep_sec = max(0.0, (chunk_ms / 1000.0) - elapsed)
            if sleep_sec > 0:
                time.sleep(sleep_sec)

    print("-" * 105)

    # 5. End session and print summary
    summary = streaming_pipeline.end_session(session_id)
    wall_clock_time = time.time() - stream_start_time

    print("\n" + "=" * 80)
    print("STREAMING SESSION SUMMARY")
    print("=" * 80)
    print(f"Session ID           : {summary.session_id}")
    print(f"Speaker ID           : {summary.speaker_id or 'None'}")
    print(f"Total Chunks         : {summary.total_chunks}")
    print(f"Total Audio Duration : {summary.total_audio_seconds:.2f} s")
    print(f"Total Speech Duration: {summary.total_speech_seconds:.2f} s")
    print(f"Wall Clock Time      : {wall_clock_time:.2f} s")
    print(f"Latency P50          : {summary.p50_latency_ms:.1f} ms")
    print(f"Latency P95          : {summary.p95_latency_ms:.1f} ms")
    print(f"Latency Mean         : {summary.mean_latency_ms:.1f} ms")
    print(f"Real-Time Factor(RTF): {summary.mean_rtf:.3f} (Values < 1.0 indicate faster than real-time)")
    print(f"Final Security Verdict: {summary.final_verdict.upper()}")
    print(f"Alert Triggered      : {summary.alert_triggered} ({summary.alert_reason or 'None'})")
    if summary.accumulated_transcript:
        print(f"Accumulated Transcript: \"{summary.accumulated_transcript}\"")
    print("=" * 80)


if __name__ == "__main__":
    main()
