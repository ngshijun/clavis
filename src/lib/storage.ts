import { supabase } from '@/lib/supabaseClient'

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
