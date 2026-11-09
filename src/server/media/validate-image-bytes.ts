import { ValidationError } from "../errors.ts";

/**
 * Image Magic-Byte Signatures for Content-Type Verification (SEC-007)
 * Strictly verifies raster image headers: JPEG, PNG, WebP, and AVIF.
 */
const SIGNATURES = [
  {
    mime: "image/jpeg",
    test: (b: Uint8Array) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    test: (b: Uint8Array) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/webp",
    test: (b: Uint8Array) =>
      b.length >= 12 &&
      b[0] === 0x52 && // R
      b[1] === 0x49 && // I
      b[2] === 0x46 && // F
      b[3] === 0x46 && // F
      b[8] === 0x57 && // W
      b[9] === 0x45 && // E
      b[10] === 0x42 && // B
      b[11] === 0x50, // P
  },
  {
    mime: "image/avif",
    test: (b: Uint8Array) => {
      if (b.length < 12) return false;
      // ISO BMFF: 4 bytes length, followed by 'ftyp', then brand (avif / avis)
      const sub = b.subarray(4, Math.min(b.length, 32));
      const str = String.fromCharCode(...sub);
      return str.includes("ftypavif") || str.includes("ftypavis");
    },
  },
];

/**
 * Detects image MIME type from binary buffer content inspection.
 * Returns null if not a recognized, secure raster image.
 */
export function detectImageMime(bytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) {
      return sig.mime;
    }
  }
  return null;
}

/**
 * Asserts that the buffer is a valid raster image matching the declared MIME type.
 * Throws ValidationError on mismatch or unsupported format.
 */
export function assertImageBytes(
  bytes: Uint8Array,
  declaredMime?: string
): string {
  if (bytes.length < 4) {
    throw new ValidationError("Uploaded file payload is truncated or empty.");
  }

  const detected = detectImageMime(bytes);
  if (!detected) {
    throw new ValidationError(
      "File content signature does not match any allowed image format. Only JPEG, PNG, WebP, and AVIF are permitted."
    );
  }

  if (declaredMime && detected !== declaredMime) {
    throw new ValidationError(
      `File format mismatch: file was declared as '${declaredMime}' but contains '${detected}' binary data.`
    );
  }

  return detected;
}
