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
