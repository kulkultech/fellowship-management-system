import fixWebmDuration from 'fix-webm-duration';

/**
 * Patches a WebM video Blob recorded by MediaRecorder with the exact duration in milliseconds.
 * MediaRecorder produces WebM files without duration metadata (resulting in Infinity/NaN in HTML5 players).
 * This function injects the EBML Duration element so standard video players can seek and preview seamlessly.
 */
export async function patchWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!blob || blob.size === 0 || durationMs <= 0) {
    return blob;
  }

  // Only patch WebM blobs
  const type = blob.type || '';
  if (!type.includes('webm') && !type.includes('matroska')) {
    return blob;
  }

  try {
    const fixedBlob = await fixWebmDuration(blob, durationMs, { logger: false });
    return fixedBlob || blob;
  } catch (err) {
    console.warn('Failed to patch WebM duration metadata, using original blob:', err);
    return blob;
  }
}
