import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import { fingerprint, MAX_IMAGE_BYTES, storedName, type ImageType } from '#lib/image.js';
import { imagePaths, uploadKey } from '#lib/item-images.js';

/** An uploaded picture, and what its own bytes say it is. */
export interface Picture {
	file: File;
	type: ImageType;
}

/**
 * What kind of picture a file is, read from how its bytes begin. Its name and
 * the type it was posted with are the sender's word and are not asked. Null
 * for anything that is not one of the pictures the buckets take.
 */
async function pictureType(file: File): Promise<ImageType | null> {
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	const bytes = (at: number, ...expected: number[]) =>
		expected.every((byte, offset) => head[at + offset] === byte);
	const letters = (at: number, expected: string) =>
		bytes(at, ...Array.from(expected, (letter) => letter.charCodeAt(0)));

	if (bytes(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	if (bytes(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (letters(0, 'GIF87a') || letters(0, 'GIF89a')) return 'image/gif';
	if (letters(0, 'RIFF') && letters(8, 'WEBP')) return 'image/webp';
	return null;
}

/**
 * Reads a posted picture: undefined when none was posted, and null for a file
 * that is too large or is not a picture the buckets take, which is refused
 * before a row is written.
 */
export async function readPicture(
	posted: FormDataEntryValue | null
): Promise<Picture | null | undefined> {
	// An empty file input still posts a zero-byte file.
	if (!(posted instanceof File) || posted.size === 0) return undefined;
	if (posted.size > MAX_IMAGE_BYTES) return null;
	const type = await pictureType(posted);
	return type ? { file: posted, type } : null;
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
 * our own making, from what the picture's bytes are, and the extension is that
 * of what the picture is, so nothing of the name it arrived with reaches the
 * bucket and a folder holds its pictures side by side, none beneath another.
 */
export async function uploadPicture(
	supabase: SupabaseClient<Database>,
	bucket: string,
	folder: string,
	picture: Picture
): Promise<string> {
	const path = `${folder}/${storedName(await fingerprint(picture.file), picture.type)}`;
	// A file is stored under the type it carries itself, so it is given the one its bytes have.
	const body = new Blob([picture.file], { type: picture.type });
	const { error } = await supabase.storage.from(bucket).upload(path, body, {
		cacheControl: '31536000',
		contentType: picture.type
	});
	if (error) throw error;
	return path;
}
