/**
 * Client side image downscaling, run before every upload.
 *
 * Uploads used to go up at whatever size the camera produced, and came back
 * down the same way to be drawn into a 40px circle. A feed of twenty prompts
 * meant twenty full size originals over the wire.
 *
 * Supabase can serve resized images, but only on the Pro plan, so the fix that
 * works for everyone is to store a sensible size in the first place. That also
 * means the file that lands in the bucket is one we produced, so the extension
 * is ours rather than taken from the user supplied filename.
 */

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Largest size that fits inside the given bounds while keeping the aspect
 * ratio. Never scales up: an image already smaller than the bounds is returned
 * untouched, since enlarging it would add bytes and no detail.
 */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): Dimensions {
  if (width <= 0 || height <= 0) return { width, height };

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  if (scale === 1) return { width, height };

  return {
    // round, not floor, or a 1000x667 image at scale 0.5 loses a pixel of
    // height and the aspect ratio drifts on repeated resizes.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  /** 0 to 1. Higher keeps more detail and more bytes. */
  quality?: number;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }

  // Safari below 15 and anything else without createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ResizedImage {
  file: File;
  width: number;
  height: number;
}

/**
 * Downscales and re-encodes to WebP. Returns the original file untouched if
 * anything goes wrong, or if the re-encoded version would be larger, which
 * happens with small images that are already well compressed. Also returns
 * the final width and height of the image.
 */
export async function resizeImage(
  file: File,
  { maxWidth, maxHeight, quality = 0.85 }: ResizeOptions
): Promise<ResizedImage> {
  let source: ImageBitmap | HTMLImageElement;

  try {
    source = await decode(file);
  } catch {
    // A file the browser cannot decode is not worth failing the upload over.
    // It will be rejected by the type check or by the bucket instead.
    return { file, width: 0, height: 0 };
  }

  try {
    const width = "width" in source ? source.width : 0;
    const height = "height" in source ? source.height : 0;
    const target = fitWithin(width, height, maxWidth, maxHeight);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, width, height };

    ctx.drawImage(source, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );

    // toBlob returns null if the browser cannot encode WebP.
    if (!blob) return { file, width, height };

    // Re-encoding a small, already optimised image can make it bigger. Only
    // take the new one if it actually helped.
    if (blob.size >= file.size && target.width === width && target.height === height) {
      return { file, width, height };
    }

    const name = file.name.replace(/\.[^./\\]*$/, "") || "image";
    const resizedFile = new File([blob], `${name}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });

    return {
      file: resizedFile,
      width: target.width,
      height: target.height,
    };
  } finally {
    if ("close" in source) source.close();
  }
}
