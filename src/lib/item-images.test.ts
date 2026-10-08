import { describe, expect, it } from 'vitest';
import { imagePaths, mapImagePaths, strayPicture, uploadKey, uploadRef } from './item-images.js';

describe('uploadRef and uploadKey', () => {
	it('name a picked picture and read the name back', () => {
		expect(uploadKey(uploadRef('abc'))).toBe('abc');
	});

	it('tell a stored picture from a picked one', () => {
		expect(uploadKey('stages/s/plant.png')).toBeNull();
	});
});

const question = {
	type: 'mcq',
	question: 'Which is the root?',
	image_path: 'stages/s/plant.png',
	options: [
		{ text: 'A', is_correct: true, image_path: 'upload:one' },
		{ text: 'B', is_correct: false, image_path: null },
		{ text: 'C', is_correct: false, image_path: '' },
		{ text: 'D', is_correct: false, image_path: 'stages/s/plant.png' }
	]
};

/** A passage's content names its picture as a question does, so the same helpers serve it. */
const passage = {
	title: 'Aina’s Bean Plant',
	body: 'Aina planted a bean.',
	image_path: 'upload:two'
};

describe('imagePaths', () => {
	it('finds every picture at any depth, each once, stored and picked alike', () => {
		expect(imagePaths(question)).toEqual(['stages/s/plant.png', 'upload:one']);
	});

	it('finds a passage’s picture', () => {
		expect(imagePaths(passage)).toEqual(['upload:two']);
		expect(imagePaths({ ...passage, image_path: null })).toEqual([]);
	});

	it('reads several rows at once, as deleting a passage with its questions does', () => {
		expect(imagePaths([{ image_path: 'stages/s/passage.png' }, [question, question]])).toEqual([
			'stages/s/passage.png',
			'stages/s/plant.png',
			'upload:one'
		]);
	});

	it('finds nothing in what holds no picture', () => {
		for (const value of [undefined, null, 'image_path', 7, [], {}, { image_path: 7 }]) {
			expect(imagePaths(value)).toEqual([]);
		}
	});
});

describe('strayPicture', () => {
	it('finds none in a row that names its own pictures and ones just picked', () => {
		expect(strayPicture(question, ['stages/s/plant.png'])).toBeUndefined();
		expect(strayPicture(passage, [])).toBeUndefined();
	});

	it('finds a stored picture that is not the row’s own', () => {
		// A new row has none of its own, so any stored picture it names is another row's.
		expect(strayPicture(question, [])).toBe('stages/s/plant.png');
		expect(strayPicture({ image_path: 'stages/other/x.png' }, ['stages/s/plant.png'])).toBe(
			'stages/other/x.png'
		);
	});
});

describe('mapImagePaths', () => {
	const stored = (path: string) =>
		uploadKey(path) === null ? path : `stages/s/${uploadKey(path)}.png`;

	it('swaps every picture and leaves the rest, and the original, as they were', () => {
		const copy = mapImagePaths(question, stored);
		expect(copy.image_path).toBe('stages/s/plant.png');
		expect(copy.options.map((option) => option.image_path)).toEqual([
			'stages/s/one.png',
			null,
			'',
			'stages/s/plant.png'
		]);
		expect(copy.question).toBe(question.question);
		expect(question.options[0].image_path).toBe('upload:one');
	});

	it('swaps a passage’s picture', () => {
		expect(mapImagePaths(passage, stored)).toEqual({ ...passage, image_path: 'stages/s/two.png' });
	});
});
