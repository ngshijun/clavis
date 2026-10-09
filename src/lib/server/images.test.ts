import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from '#lib/image.js';
import { postedPictures, readPicture } from './images.js';

/** The bytes each kind of picture begins with, padded out to look like a file. */
const HEADS = {
	'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
	'image/gif': [...'GIF89a'].map((letter) => letter.charCodeAt(0)),
	'image/webp': [...'RIFF\0\0\0\0WEBP'].map((letter) => letter.charCodeAt(0))
} as const;

const file = (head: readonly number[], name: string, type: string, size = 64) =>
	new File(
		[new Uint8Array([...head, ...new Array(Math.max(0, size - head.length)).fill(0)])],
		name,
		{
			type
		}
	);

describe('readPicture', () => {
	it.each(Object.entries(HEADS))('knows a %s by its bytes', async (type, head) => {
		expect(await readPicture(file(head, 'picture', type))).toMatchObject({ type });
	});

	it('goes by the bytes, whatever the name and the declared type say', async () => {
		const picture = await readPicture(file(HEADS['image/png'], 'photo.html', 'text/html'));
		expect(picture).toMatchObject({ type: 'image/png' });
	});

	it('refuses a file that is not a picture, though it is named and declared as one', async () => {
		const html = [...'<!doctype html><script>'].map((letter) => letter.charCodeAt(0));
		expect(await readPicture(file(html, 'x.png', 'image/png'))).toBeNull();
		// A vector picture is not one of the kinds that are stored.
		const svg = [...'<svg xmlns="http://www.w3.org/2000/svg"/>'].map((letter) =>
			letter.charCodeAt(0)
		);
		expect(await readPicture(file(svg, 'x.svg', 'image/svg+xml'))).toBeNull();
	});

	it('refuses a picture that is too large', async () => {
		const png = HEADS['image/png'];
		expect(await readPicture(file(png, 'big.png', 'image/png', MAX_IMAGE_BYTES))).not.toBeNull();
		expect(await readPicture(file(png, 'big.png', 'image/png', MAX_IMAGE_BYTES + 1))).toBeNull();
	});

	it('reads nothing where nothing was posted', async () => {
		expect(await readPicture(null)).toBeUndefined();
		expect(await readPicture('a string')).toBeUndefined();
		// An empty file input still posts a zero-byte file.
		expect(await readPicture(new File([], ''))).toBeUndefined();
	});
});

describe('postedPictures', () => {
	const png = () => file(HEADS['image/png'], 'a.png', 'image/png');
	const payload = {
		image_path: 'upload:one',
		options: [{ image_path: 'stages/s/kept.png' }, { image_path: 'upload:two' }]
	};

	it('reads the file of each picture that was picked, by its key', async () => {
		const form = new FormData();
		form.set('one', png());
		form.set('two', file(HEADS['image/gif'], 'b.gif', 'image/gif'));
		form.set('three', png());
		const pictures = await postedPictures(payload, form);
		expect([...(pictures ?? [])].map(([key, picture]) => [key, picture.type])).toEqual([
			['one', 'image/png'],
			['two', 'image/gif']
		]);
	});

	it('reads none for a value that names only stored pictures', async () => {
		const stored = await postedPictures({ image_path: 'stages/s/kept.png' }, new FormData());
		expect(stored?.size).toBe(0);
	});

	it('is null when a picked picture has no file, or its file is not a picture', async () => {
		const missing = new FormData();
		missing.set('one', png());
		expect(await postedPictures(payload, missing)).toBeNull();

		const wrong = new FormData();
		wrong.set('one', png());
		wrong.set('two', new File(['<html>'], 'b.png', { type: 'image/png' }));
		expect(await postedPictures(payload, wrong)).toBeNull();
	});
});
