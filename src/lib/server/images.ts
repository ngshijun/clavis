import * as z from 'zod';

/** What the image buckets accept; anything else is refused before a row is written. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** An optional image upload. `invalid` is what the person is told when the file is refused. */
export function imageField(invalid: () => string) {
	return (
		z
			.file()
			.optional()
			// An empty file input still posts a zero-byte file.
			.transform((file) => (file && file.size > 0 ? file : undefined))
			.refine(
				(file) => !file || (IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES),
				{
					error: invalid
				}
			)
	);
}

/** Where an upload is stored: under `folder`, keeping only the extension of the name it came with. */
export function imagePath(folder: string, file: File): string {
	const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
	return `${folder}/${crypto.randomUUID()}${extension}`;
}
