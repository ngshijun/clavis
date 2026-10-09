/**
 * The pictures a question or a passage names. Every picture, wherever it sits
 * in a payload (the question's own, an option's, an item's) and in a passage's
 * content, is a key called `image_path` holding its object path in the
 * question images bucket.
 *
 * A picture picked in the editor and not saved yet is written `upload:<key>`
 * instead, and its file travels with the Save under the form field `<key>`.
 * The Save action uploads it and puts the object path in its place. An import
 * writes a picture of the workbook the same way, with its fingerprint as the
 * key.
 */

import { storedFingerprint } from '#lib/image.js';

const UPLOAD = 'upload:';

/** What a draft writes for a picture that is still a file in the page. */
export function uploadRef(key: string): string {
	return UPLOAD + key;
}

/** The form field a pending picture's file travels under; null for a stored picture. */
export function uploadKey(path: string): string | null {
	return path.startsWith(UPLOAD) ? path.slice(UPLOAD.length) : null;
}

/**
 * What a picture is told from another by: its fingerprint, which a stored
 * picture has in its name and a picture of an import is named by. Two
 * questions that differ only in a picture are told apart by it.
 */
export function pictureMark(path: string): string {
	return uploadKey(path) ?? storedFingerprint(path) ?? path;
}

/** Every picture named anywhere in `value`, stored and pending alike, each once. */
export function imagePaths(value: unknown): string[] {
	const found = new Set<string>();
	walk(value, (path) => {
		found.add(path);
		return path;
	});
	return [...found];
}

/**
 * A stored picture that `value` names and that is not one of `own`: another
 * row's, which a row may not take for itself. Undefined when it names none.
 */
export function strayPicture(value: unknown, own: string[]): string | undefined {
	return imagePaths(value).find((path) => uploadKey(path) === null && !own.includes(path));
}

/** A copy of `value` with every picture's path replaced by what `swap` returns for it. */
export function mapImagePaths<T>(value: T, swap: (path: string) => string): T {
	return walk(value, swap) as T;
}

function walk(value: unknown, swap: (path: string) => string): unknown {
	if (Array.isArray(value)) return value.map((inner) => walk(inner, swap));
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, inner]) => [
			key,
			key === 'image_path' && typeof inner === 'string' && inner !== ''
				? swap(inner)
				: walk(inner, swap)
		])
	);
}
