/**
 * Compress/resize an image in the browser before uploading.
 * Heavy developer photos (often 3–8 MB) become ~150–400 KB, which fixes
 * the slow image loading on the site, dashboard and mobile app.
 *
 * Dependency-free (canvas based). Returns the original file unchanged for
 * non-images, GIFs/SVGs, or if compression would not reduce the size.
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<File> {
  const { maxDim = 1600, quality = 0.72 } = opts;

  if (
    typeof window === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
