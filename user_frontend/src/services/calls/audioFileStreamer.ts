// user_frontend/src/services/calls/audioFileStreamer.ts
// Streams a real audio file (e.g. samples/cloned/tts_cloned_ava.wav) in real time
// (1-second chunks @ 16kHz mono) through the backend WebSocket. Zero mock data.

import { downsampleTo16kHz, float32ToInt16PCM, encodeWAV } from '../../utils/audioUtils';

export interface AudioFileStreamProgress {
  chunkIndex: number;
  totalChunks: number;
  bytesSent: number;
  rms: number;
  completed: boolean;
}

export class AudioFileStreamer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isStreaming = false;

  async startStreaming(
    fileUrl: string,
    ws: WebSocket,
    onProgress?: (progress: AudioFileStreamProgress) => void,
    onComplete?: () => void,
    loop: boolean = true
  ): Promise<void> {
    this.stop();
    this.isStreaming = true;

    console.info(`[AudioFileStreamer] Fetching real audio file from ${fileUrl}...`);
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Failed to load audio sample from ${fileUrl} (HTTP ${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      const nativeSr = audioBuffer.sampleRate;

      console.info(`[AudioFileStreamer] Decoded audio: sampleRate=${nativeSr}, duration=${audioBuffer.duration.toFixed(2)}s`);

      // Resample to 16kHz mono float32
      const float32Samples = downsampleTo16kHz(Array.from(channelData), nativeSr);

      // Divide into 1.0-second chunks (16000 samples each)
      const chunkSize = 16000;
      const totalChunks = Math.ceil(float32Samples.length / chunkSize);
      let currentChunk = 0;
      let totalBytesSent = 0;

      console.info(`[AudioFileStreamer] Prepared ${totalChunks} real audio chunks (1s each) at 16kHz mono (loop=${loop}).`);

      return new Promise<void>((resolve) => {
        this.timer = setInterval(() => {
          if (!this.isStreaming || ws.readyState !== WebSocket.OPEN) {
            this.stop();
            resolve();
            return;
          }

          if (currentChunk >= totalChunks) {
            if (loop) {
              currentChunk = 0;
            } else {
              this.stop();
              if (onProgress) {
                onProgress({
                  chunkIndex: totalChunks,
                  totalChunks,
                  bytesSent: totalBytesSent,
                  rms: 0.05,
                  completed: true,
                });
              }
              if (onComplete) onComplete();
              resolve();
              return;
            }
          }

          const startIdx = currentChunk * chunkSize;
          const endIdx = Math.min(startIdx + chunkSize, float32Samples.length);
          const chunkSlice = float32Samples.slice(startIdx, endIdx);

          // Calculate chunk RMS for waveform display
          let sumSq = 0;
          for (let i = 0; i < chunkSlice.length; i++) {
            sumSq += chunkSlice[i] * chunkSlice[i];
          }
          const rms = Math.sqrt(sumSq / (chunkSlice.length || 1));

          const int16PCM = float32ToInt16PCM(chunkSlice);
          const wavBuffer = encodeWAV(int16PCM, 16000);

          ws.send(wavBuffer);
          currentChunk++;
          totalBytesSent += wavBuffer.byteLength;

          console.info(`[AudioFileStreamer] Sent chunk #${currentChunk}/${totalChunks} (${wavBuffer.byteLength} bytes, RMS=${rms.toFixed(3)})`);

          if (onProgress) {
            onProgress({
              chunkIndex: currentChunk,
              totalChunks,
              bytesSent: totalBytesSent,
              rms: Math.min(1.0, Math.max(0.05, rms * 4.0)),
              completed: currentChunk >= totalChunks,
            });
          }
        }, 1000);
      });
    } finally {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    }
  }

  stop(): void {
    this.isStreaming = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get isActive(): boolean {
    return this.isStreaming;
  }
}
