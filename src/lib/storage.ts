import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { optimizeImage, type OptimizeImageOptions } from '@/lib/imageOptimizer'

/**
 * Get public URL for a Supabase Storage image.
 * Handles null paths, http/data: URL passthrough.
 */
export function getStorageImageUrl(bucket: string, path: string | null): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Get public URL for an avatar from its storage path.
 */
export function getAvatarUrl(path: string | null): string {
  return getStorageImageUrl('avatars', path)
}

/**
 * Get public URL for a badge icon from its storage path.
 */
export function getBadgeIconUrl(path: string | null): string {
  return getStorageImageUrl('badges', path)
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
    return { path: null, error: handleError(err, 'failedUploadImage') }
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
    return { error: handleError(err, 'failedDeleteImage') }
  }
}

/**
 * Factory that creates bucket-scoped image URL helpers.
 * All variants resolve to the same public URL since images are
 * pre-optimized at upload time.
 */
export function createBucketImageHelpers(bucket: string) {
  function getImageUrl(path: string | null): string {
    return getStorageImageUrl(bucket, path)
  }

  return {
    getImageUrl,
    getOptimizedImageUrl: getImageUrl,
    getThumbnailImageUrl: getImageUrl,
  }
}
