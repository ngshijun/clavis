// scripts/migrate-images.ts
//
// One-time migration: download existing images from Supabase Storage,
// convert to WebP via Sharp, re-upload, update DB paths, delete originals.
//
// Usage: npx tsx scripts/migrate-images.ts
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface BucketConfig {
  bucket: string
  maxDimension: number
  tables: {
    table: string
    columns: string[]
  }[]
}

const BUCKETS: BucketConfig[] = [
  {
    bucket: 'avatars',
    maxDimension: 256,
    tables: [{ table: 'profiles', columns: ['avatar_path'] }],
  },
  {
    bucket: 'question-images',
    maxDimension: 1200,
    tables: [
      {
        table: 'questions',
        columns: [
          'image_path',
          'option_1_image_path',
          'option_2_image_path',
          'option_3_image_path',
          'option_4_image_path',
        ],
      },
    ],
  },
  {
    bucket: 'announcement-images',
    maxDimension: 1200,
    tables: [{ table: 'announcements', columns: ['image_path'] }],
  },
  {
    bucket: 'pet-images',
    maxDimension: 1200,
    tables: [
      {
        table: 'pets',
        columns: ['image_path', 'tier2_image_path', 'tier3_image_path'],
      },
    ],
  },
  {
    bucket: 'curriculum-images',
    maxDimension: 1200,
    tables: [
      { table: 'subjects', columns: ['cover_image_path'] },
      { table: 'topics', columns: ['cover_image_path'] },
      { table: 'sub_topics', columns: ['cover_image_path'] },
    ],
  },
]

const SKIP_EXTENSIONS = new Set(['.svg', '.gif', '.webp'])
const BATCH_SIZE = 10

async function optimizeBuffer(buffer: Buffer, maxDimension: number): Promise<Buffer> {
  const image = sharp(buffer)
  const metadata = await image.metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  let resized = image
  if (width > maxDimension || height > maxDimension) {
    resized = image.resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
  }

  return resized.webp({ quality: 80 }).toBuffer()
}

async function listAllFiles(bucket: string): Promise<string[]> {
  const paths: string[] = []

  async function listRecursive(folder: string) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 })
    if (error) {
      console.error(`  Error listing ${bucket}/${folder}:`, error.message)
      return
    }
    for (const item of data ?? []) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name
      if (item.id) {
        // It's a file
        paths.push(fullPath)
      } else {
        // It's a folder — recurse
        await listRecursive(fullPath)
      }
    }
  }

  await listRecursive('')
  return paths
}

async function migrateFile(
  bucket: string,
  filePath: string,
  maxDimension: number,
): Promise<{ oldPath: string; newPath: string } | null> {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (SKIP_EXTENSIONS.has(ext)) {
    return null
  }

  // Download
  const { data: blob, error: dlError } = await supabase.storage.from(bucket).download(filePath)
  if (dlError || !blob) {
    console.error(`  Download failed: ${filePath}`, dlError?.message)
    return null
  }

  // Optimize
  const buffer = Buffer.from(await blob.arrayBuffer())
  const optimized = await optimizeBuffer(buffer, maxDimension)

  // Upload new .webp file
  const newPath = filePath.replace(/\.[^.]+$/, '.webp')
  if (newPath === filePath) return null // already .webp extension somehow

  const { error: upError } = await supabase.storage.from(bucket).upload(newPath, optimized, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: true,
  })

  if (upError) {
    console.error(`  Upload failed: ${newPath}`, upError.message)
    return null
  }

  // Delete original
  await supabase.storage.from(bucket).remove([filePath])

  return { oldPath: filePath, newPath }
}

async function updateDbPaths(
  tables: BucketConfig['tables'],
  oldPath: string,
  newPath: string,
): Promise<void> {
  for (const { table, columns } of tables) {
    for (const column of columns) {
      const { error } = await supabase
        .from(table)
        .update({ [column]: newPath })
        .eq(column, oldPath)

      if (error) {
        console.error(`  DB update failed: ${table}.${column} ${oldPath} -> ${newPath}`, error.message)
      }
    }
  }
}

async function migrateBucket(config: BucketConfig): Promise<void> {
  console.log(`\nMigrating bucket: ${config.bucket}`)
  const files = await listAllFiles(config.bucket)
  console.log(`  Found ${files.length} files`)

  let migrated = 0
  let skipped = 0

  // Process in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map((f) => migrateFile(config.bucket, f, config.maxDimension)),
    )

    for (const result of results) {
      if (result) {
        await updateDbPaths(config.tables, result.oldPath, result.newPath)
        migrated++
        console.log(`  Migrated: ${result.oldPath} -> ${result.newPath}`)
      } else {
        skipped++
      }
    }
  }

  console.log(`  Done: ${migrated} migrated, ${skipped} skipped`)
}

async function main() {
  console.log('Starting image migration...')
  for (const config of BUCKETS) {
    await migrateBucket(config)
  }
  console.log('\nMigration complete.')
}

main().catch(console.error)
