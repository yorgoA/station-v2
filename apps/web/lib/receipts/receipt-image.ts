import sharp from "sharp";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif"
};

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  return MIME_EXT[m] || "jpg";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Infer image/* MIME from a browser File (type + extension fallback). */
export function inferReceiptImageMime(file: File): string {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif"
  };
  const mimeFromClient = file.type?.trim();
  if (mimeFromClient && mimeFromClient.startsWith("image/")) {
    return mimeFromClient;
  }
  return mimeMap[ext] || "image/jpeg";
}

/**
 * Downscale large phone photos (e.g. iPhone HEIC) for faster uploads and storage.
 * Max edge and JPEG quality configurable via env (RECEIPT_MAX_PIXEL_EDGE / RECEIPT_JPEG_QUALITY).
 * On failure (unsupported format), returns the original buffer.
 */
export async function optimizeReceiptImageBuffer(
  buffer: Buffer,
  inputMime: string
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  const mime = inputMime.toLowerCase();
  if (!mime.startsWith("image/") || mime === "image/svg+xml") {
    return { buffer, mimeType: inputMime, ext: extForMime(inputMime) };
  }

  const maxEdge = clamp(parseInt(process.env.RECEIPT_MAX_PIXEL_EDGE || "1600", 10) || 1600, 640, 4096);
  const quality = clamp(parseInt(process.env.RECEIPT_JPEG_QUALITY || "82", 10) || 82, 60, 95);

  try {
    const pipeline = sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true });

    const out = await pipeline.toBuffer();
    return { buffer: out, mimeType: "image/jpeg", ext: "jpg" };
  } catch {
    return { buffer, mimeType: inputMime, ext: extForMime(inputMime) };
  }
}
