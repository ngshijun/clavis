/**
 * The one kind of picture that is stored. Whatever a person picks is made into
 * a WebP before it is uploaded, and the server refuses anything else, so a
 * page never waits for a photograph in the size its camera took it.
 */
export const STORED_IMAGE_TYPE = 'image/webp';

/** What a file input that picks a picture accepts. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

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
export function storedName(mark: string): string {
	return `${mark}-${crypto.randomUUID()}.webp`;
}

/** The fingerprint in the name of a stored picture; undefined for a path that has none. */
export function storedFingerprint(path: string): string | undefined {
	return /(?:^|\/)([0-9a-f]{32})-[^/]*$/.exec(path)?.[1];
}

/**
 * A picked file made ready to upload: a WebP no larger than a page shows it.
 * Null for one that cannot be taken, because the browser cannot read it as a
 * picture (a HEIC photo, a damaged file) or it is still too large. The server
 * checks an upload again by its own bytes.
 */
export async function preparePicture(file: File): Promise<File | null> {
	let ready: File;
	try {
		ready = await toWebp(file);
	} catch {
		return null;
	}
	return ready.size <= MAX_IMAGE_BYTES ? ready : null;
}

/** The longest side a stored picture has, in pixels. */
const MAX_DIMENSION = 1200;

/**
 * A picture as a WebP of at most `MAX_DIMENSION` a side. One that is such a
 * WebP already is handed back as it is. Of a moving GIF the first frame is
 * kept. Throws for a file the browser cannot read as a picture.
 */
async function toWebp(file: File): Promise<File> {
	// Decoding through a bitmap applies the EXIF orientation.
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

	if (file.type === STORED_IMAGE_TYPE && scale === 1) {
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

	const quality = 0.8;
	const drawn = await canvas.convertToBlob({ type: STORED_IMAGE_TYPE, quality });
	// Safari cannot write a WebP and answers with a PNG instead, several times the size. The
	// encoder it lacks is loaded there, and only there.
	const webp = drawn.type === STORED_IMAGE_TYPE ? drawn : await encoded(context, quality);
	return new File([webp], file.name.replace(/\.[^.]+$/, '') + '.webp', {
		type: STORED_IMAGE_TYPE
	});
}

/** What is drawn on a canvas as the bytes of a WebP, made by an encoder of our own. */
async function encoded(
	context: OffscreenCanvasRenderingContext2D,
	quality: number
): Promise<ArrayBuffer> {
	const { default: encode } = await import('@jsquash/webp/encode.js');
	const { width, height } = context.canvas;
	return encode(context.getImageData(0, 0, width, height), { quality: quality * 100 });
}
