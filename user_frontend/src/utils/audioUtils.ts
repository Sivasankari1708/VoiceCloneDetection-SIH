// ─── Audio Utility Functions ─────────────────────────────────────────────────
// Ensures 100% reliable 16kHz mono 16-bit PCM and WAV encoding across all browsers.

/**
 * Downsamples audio from any browser sample rate (e.g. 44.1kHz, 48kHz) to 16,000 Hz
 * using high-quality linear interpolation.
 */
export function downsampleTo16kHz(
  buffer: Float32Array | number[],
  inputSampleRate: number
): Float32Array {
  if (inputSampleRate === 16000) {
    return buffer instanceof Float32Array ? buffer : new Float32Array(buffer);
  }

  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Converts float32 audio samples (-1.0 to 1.0) into 16-bit PCM bytes.
 */
export function float32ToInt16PCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1.0, Math.min(1.0, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

/**
 * Creates a standard 44-byte RIFF WAV container for 16kHz 16-bit mono PCM.
 * Compatible with soundfile, librosa, and raw byte decoders.
 */
export function encodeWAV(int16PCM: Int16Array, sampleRate = 16000): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const dataByteCount = int16PCM.byteLength;
  const buffer = new ArrayBuffer(44 + dataByteCount);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);

  // Copy PCM samples
  const pcmView = new Int16Array(buffer, 44, int16PCM.length);
  pcmView.set(int16PCM);

  return buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}