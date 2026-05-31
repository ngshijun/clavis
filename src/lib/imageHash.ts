/**
 * Image Hash Utility
 *
 * Computes SHA-256 hash of images for duplicate detection.
 * Combines all images (question + options) into a single hash.
 */

/**
 * Compute SHA-256 hash of an ArrayBuffer
 */
async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Compute hash from a File object
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return hashArrayBuffer(buffer)
}

/**
 * Compute hash from a base64 string (without data URL prefix)
 */
export async function hashBase64(base64: string): Promise<string> {
  const buffer = base64ToArrayBuffer(base64)
  return hashArrayBuffer(buffer)
}

/**
 * Fetch image from URL and compute its hash
 */
export async function hashImageUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`)
    const buffer = await response.arrayBuffer()
    return hashArrayBuffer(buffer)
  } catch {
    // The image content is unreachable (transient fetch error, expired signed URL, etc.).
    // Fall back to a stable hash of the URL string so one bad image degrades duplicate
    // detection gracefully (the same path still collides with itself) instead of rejecting
    // the whole Promise.all in computeQuestionImageHash and discarding every image's hash.
    const encoder = new TextEncoder()
    return hashArrayBuffer(encoder.encode(url).buffer as ArrayBuffer)
  }
}

/**
 * Combine multiple hashes into a single hash
 * Used when a question has multiple images (question + options)
 */
export async function combineHashes(hashes: string[]): Promise<string> {
  if (hashes.length === 0) return ''
  if (hashes.length === 1) return hashes[0] ?? ''

  // Sort hashes to ensure consistent ordering
  const sorted = [...hashes].sort()
  const combined = sorted.join('|')

  // Hash the combined string
  const encoder = new TextEncoder()
  const data = encoder.encode(combined)
  return hashArrayBuffer(data.buffer as ArrayBuffer)
}

export interface ImageHashInput {
  questionImage?: File | string | null // File, base64, or URL
  optionAImage?: File | string | null
  optionBImage?: File | string | null
  optionCImage?: File | string | null
  optionDImage?: File | string | null
}

/**
 * Compute combined hash for all images in a question
 * Returns empty string if no images
 * Fetches/hashes all images in parallel for better performance
 */
export async function computeQuestionImageHash(input: ImageHashInput): Promise<string> {
  const images = [
    input.questionImage,
    input.optionAImage,
    input.optionBImage,
    input.optionCImage,
    input.optionDImage,
  ].filter((img): img is File | string => img != null)

  if (images.length === 0) return ''

  // Process all images in parallel
  const hashPromises = images.map(async (img) => {
    if (img instanceof File) {
      return hashFile(img)
    } else if (img.startsWith('http://') || img.startsWith('https://')) {
      return hashImageUrl(img)
    } else {
      // Assume base64
      return hashBase64(img)
    }
  })

  const hashes = await Promise.all(hashPromises)
  return combineHashes(hashes)
}
