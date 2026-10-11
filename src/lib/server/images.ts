import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import { fingerprint, MAX_IMAGE_BYTES, STORED_IMAGE_TYPE, storedName } from '#lib/image.js';
import { imagePaths, uploadKey } from '#lib/item-images.js';

/**
 * An uploaded picture that is what the buckets take: a WebP, as the page makes
 * every picture before it sends it.
 */
export type Picture = File;

/**
 * Whether a file is a WebP, read from how its bytes begin. Its name and the
 * type it was posted with are the sender's word and are not asked.
 */
async function isWebp(file: File): Promise<boolean> {
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	const letters = (at: number, expected: string) =>
		Array.from(expected).every((letter, offset) => head[at + offset] === letter.charCodeAt(0));
	return letters(0, 'RIFF') && letters(8, 'WEBP');
}

/**
 * Reads a posted picture: undefined when none was posted, and null for a file
 * that is too large or is not a WebP, which is refused before a row is
 * written.
 */
export async function readPicture(
	posted: FormDataEntryValue | null
): Promise<Picture | null | undefined> {
	// An empty file input still posts a zero-byte file.
	if (!(posted instanceof File) || posted.size === 0) return undefined;
	if (posted.size > MAX_IMAGE_BYTES) return null;
	return (await isWebp(posted)) ? posted : null;
}

/**
 * The picture posted for each one that `value` names as `upload:<key>`, by
 * its key; null when one is missing or is refused.
 */
export async function postedPictures(
	value: unknown,
	form: FormData
): Promise<Map<string, Picture> | null> {
	const pictures = new Map<string, Picture>();
	for (const path of imagePaths(value)) {
		const key = uploadKey(path);
		if (key === null) continue;
		const picture = await readPicture(form.get(key));
		if (!picture) return null;
		pictures.set(key, picture);
	}
	return pictures;
}

/**
 * Stores a picture under `folder` and returns its object path. The name is of
 * our own making, from what the picture's bytes are, so nothing of the name it
 * arrived with reaches the bucket and a folder holds its pictures side by
 * side, none beneath another.
 */
export async function uploadPicture(
	supabase: SupabaseClient<Database>,
	bucket: string,
	folder: string,
	picture: Picture
): Promise<string> {
	const path = `${folder}/${storedName(await fingerprint(picture))}`;
	// A file is stored under the type it carries itself, so it is given the one its bytes have.
	const body = new Blob([picture], { type: STORED_IMAGE_TYPE });
	const { error } = await supabase.storage.from(bucket).upload(path, body, {
		cacheControl: '31536000',
		contentType: STORED_IMAGE_TYPE
	});
	if (error) throw error;
	return path;
}
