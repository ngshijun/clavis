export interface OptimizeImageOptions {
  /** Max width or height in pixels. Default: 1200 */
  maxDimension?: number
  /** WebP quality 0–1. Default: 0.8 */
  quality?: number
}

/**
 * Resize and convert an image to WebP using browser-native APIs.
 * Skips SVGs (vector), GIFs (may be animated), and images already optimized.
 */
export async function optimizeImage(
  file: File | Blob,
  options?: OptimizeImageOptions,
): Promise<File> {
  const type = file.type
  const name = file instanceof File ? file.name : 'image'

  // Skip non-raster formats
  if (!type.startsWith('image/') || type === 'image/svg+xml' || type === 'image/gif') {
    return file instanceof File ? file : new File([file], name, { type })
  }

  const maxDimension = options?.maxDimension ?? 1200
  const quality = options?.quality ?? 0.8

  // Decode image (auto-handles EXIF orientation)
  const bitmap = await createImageBitmap(file)

  // Skip if already WebP and within dimension limits
  if (type === 'image/webp' && bitmap.width <= maxDimension && bitmap.height <= maxDimension) {
    bitmap.close()
    return file instanceof File ? file : new File([file], name, { type })
  }

  // Calculate scaled dimensions preserving aspect ratio
  let { width, height } = bitmap
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  // Draw to OffscreenCanvas and convert to WebP
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Failed to acquire 2D rendering context')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  const webpName = name.replace(/\.[^.]+$/, '.webp')
  return new File([blob], webpName, { type: 'image/webp' })
}
