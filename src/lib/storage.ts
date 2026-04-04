import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { optimizeImage, type OptimizeImageOptions } from '@/lib/imageOptimizer'

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * Get public URL for a Supabase Storage image with optional transformation.
 * Handles null paths, http/data: URL passthrough.
 *
 * Uses wsrv.nl as an image proxy for resizing/format conversion since
 * Supabase Image Transformations requires a Pro plan.
 */
export function getStorageImageUrl(
  bucket: string,
  path: string | null,
  transform?: ImageTransformOptions,
): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = data.publicUrl

  if (transform) {
    const params = new URLSearchParams()
    params.set('url', publicUrl)
    if (transform.width) params.set('w', String(transform.width))
    if (transform.height) params.set('h', String(transform.height))
    params.set('q', String(transform.quality ?? 80))
    params.set('fit', transform.resize ?? 'contain')
    params.set('output', 'auto')
    return `https://wsrv.nl/?${params.toString()}`
  }

  return publicUrl
}

/**
 * Get optimized public URL for an avatar from its storage path.
 * Avatars display at 32–48px CSS; 96px at 2x Retina with cover crop.
 */
export function getAvatarUrl(path: string | null): string {
  return getStorageImageUrl('avatars', path, {
    width: 96,
    height: 96,
    quality: 80,
    resize: 'cover',
  })
}

/**
 * Upload a file to Supabase Storage with a random UUID filename.
 * Images are optimized to WebP by default; pass `optimize: false` to skip.
 * Optionally deletes an old file at `oldPath` (best-effort, non-blocking).
 */
export async function uploadStorageFile(
  bucket: string,
  file: File,
  options?: {
    folder?: string
    oldPath?: string | null
    optimize?: OptimizeImageOptions | false
  },
): Promise<{ path: string | null; error: string | null }> {
  try {
    // Optimize image before upload (default: on)
    const processedFile =
      options?.optimize === false ? file : await optimizeImage(file, options?.optimize)

    const dotIndex = processedFile.name.lastIndexOf('.')
    const fileExt = dotIndex > 0 ? processedFile.name.slice(dotIndex) : ''
    const folder = options?.folder
    const fileName = `${crypto.randomUUID()}${fileExt}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, processedFile, {
        cacheControl: '31536000',
        contentType: processedFile.type,
      })

    if (uploadError) throw uploadError

    if (options?.oldPath) {
      supabase.storage
        .from(bucket)
        .remove([options.oldPath])
        .catch(() => {})
    }

    return { path: filePath, error: null }
  } catch (err) {
    return { path: null, error: handleError(err, 'Failed to upload image.') }
  }
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteStorageFile(
  bucket: string,
  path: string,
): Promise<{ error: string | null }> {
  try {
    const { error: deleteError } = await supabase.storage.from(bucket).remove([path])
    if (deleteError) throw deleteError
    return { error: null }
  } catch (err) {
    return { error: handleError(err, 'Failed to delete image.') }
  }
}

/**
 * Factory that creates bucket-scoped image URL helpers.
 * Eliminates the repeated getImageUrl/getOptimizedImageUrl/getThumbnailImageUrl
 * triplet pattern across stores.
 */
export function createBucketImageHelpers(
  bucket: string,
  sizes?: {
    optimized?: ImageTransformOptions
    thumbnail?: ImageTransformOptions
  },
) {
  const optimized = sizes?.optimized ?? { width: 800, quality: 80 }
  const thumbnail = sizes?.thumbnail ?? { width: 200, quality: 70 }

  function getImageUrl(path: string | null, transform?: ImageTransformOptions): string {
    return getStorageImageUrl(bucket, path, transform)
  }

  function getOptimizedImageUrl(path: string | null): string {
    return getStorageImageUrl(bucket, path, optimized)
  }

  function getThumbnailImageUrl(path: string | null): string {
    return getStorageImageUrl(bucket, path, thumbnail)
  }

  return { getImageUrl, getOptimizedImageUrl, getThumbnailImageUrl }
}
