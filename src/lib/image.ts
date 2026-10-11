/** The pictures the app takes, by content type, and the extension each is stored under. */
export const IMAGE_EXTENSIONS = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
} as const;
export type ImageType = keyof typeof IMAGE_EXTENSIONS;

/** What a file input that picks a picture accepts. */
export const IMAGE_ACCEPT = Object.keys(IMAGE_EXTENSIONS).join(',');

/** The largest picture that is stored. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * What tells one picture from another: the start of the SHA-256 of its bytes,
 * in hex. The same bytes have the same fingerprint in the browser and on the
 * server, which is how a picture about to be uploaded is known to be one that
 * is stored already.
 */
export async function fingerprint(picture: Blob): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', await picture.arrayBuffer());
	return Array.from(new Uint8Array(digest, 0, 16), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
}

/**
 * The name a picture is stored under: its fingerprint, then an id of its own,
 * so two rows that show the same picture each keep a file of theirs.
 */
export function storedName(mark: string, type: ImageType): string {
	return `${mark}-${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
}

/** The fingerprint in the name of a stored picture; undefined for a path that has none. */
export function storedFingerprint(path: string): string | undefined {
	return /(?:^|\/)([0-9a-f]{32})-[^/]*$/.exec(path)?.[1];
}

/**
 * A picked file made ready to upload: optimised, and null for one that cannot
 * be taken, because the browser cannot read it as a picture (a HEIC photo, a
 * damaged file), or it is not of a kind the app takes, or it is still too
 * large. The server checks an upload again by its own bytes.
 */
export async function preparePicture(file: File): Promise<File | null> {
	let ready: File;
	try {
		ready = await optimizeImage(file);
	} catch {
		return null;
	}
	return ready.type in IMAGE_EXTENSIONS && ready.size <= MAX_IMAGE_BYTES ? ready : null;
}

/**
 * Resize a picked image and convert it to WebP in the browser, so what is
 * uploaded is a few hundred kilobytes rather than a phone camera's original.
 * SVGs (vector) and GIFs (possibly animated) are passed through untouched.
 */
export async function optimizeImage(file: File, maxDimension = 1200): Promise<File> {
	if (
		!file.type.startsWith('image/') ||
		file.type === 'image/svg+xml' ||
		file.type === 'image/gif'
	) {
		return file;
	}

	// Decoding through a bitmap applies the EXIF orientation.
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));

	if (file.type === 'image/webp' && scale === 1) {
		bitmap.close();
		return file;
	}

	const canvas = new OffscreenCanvas(
		Math.round(bitmap.width * scale),
		Math.round(bitmap.height * scale)
	);
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		throw new Error('Failed to acquire 2D rendering context');
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
	return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}
