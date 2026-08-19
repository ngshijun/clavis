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
 * Upload a file to Supabase Storage with a random UUID filename.
 * Images are optimized to WebP by default; pass `optimize: false` to skip.
 *
 * Replacing an image never deletes the old object here (decision 78): the
 * old path may still be the row's persisted value, and deleting it before
 * the new path is confirmed saved would leave a broken image on a failed
 * save. Callers delete the replaced object AFTER the save confirms, via
 * `removeStorageObjects`.
 */
export async function uploadStorageFile(
  bucket: string,
  file: File,
  options?: {
    folder?: string
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
 * Best-effort removal of storage objects (decision 78): blank/null paths are
 * skipped and any failure is logged and swallowed — an orphaned object is
 * always preferable to a blocked row delete, and storage rows cannot be
 * cleaned from SQL (`storage.protect_delete()`), so this client-side pass is
 * the only cleanup there is.
 */
export async function removeStorageObjects(
  bucket: string,
  paths: (string | null | undefined)[],
): Promise<void> {
  const targets = [...new Set(paths.filter((path): path is string => !!path?.trim()))]
  if (targets.length === 0) return
  try {
    const { error } = await supabase.storage.from(bucket).remove(targets)
    if (error) throw error
  } catch (err) {
    console.error(`Failed to remove ${bucket} objects:`, targets, err)
  }
}

/**
 * Best-effort removal of every object under a folder (decision 78) — used
 * when deleting an assessment, whose images all live under
 * `assessment-images/{assessmentId}/`. Paginates the listing; failures are
 * logged and swallowed, same contract as `removeStorageObjects`.
 */
export async function removeStorageFolder(bucket: string, folder: string): Promise<void> {
  const pageSize = 100
  const paths: string[] = []
  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: pageSize, offset })
      if (error) throw error
      if (!data || data.length === 0) break
      paths.push(...data.map((object) => `${folder}/${object.name}`))
      if (data.length < pageSize) break
    }
  } catch (err) {
    console.error(`Failed to list ${bucket}/${folder}:`, err)
    return
  }
  await removeStorageObjects(bucket, paths)
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
