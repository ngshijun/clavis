import { describe, expect, it } from 'vitest';
import { chipsToSentence, sentenceToChips } from '#lib/items/text.js';
import { cutsOf, joinChips, recut, splitChip, type Chip } from './rearrange-chips.js';

/** Chips written with a bar between them: `Plants|need sunlight|.` Each gets its text as its id. */
function chips(drawn: string): Chip[] {
	return drawn.split('|').map((text, at) => ({ id: `${at}:${text}`, text }));
}

const texts = (list: Chip[]) => list.map((chip) => chip.text).join('|');

describe('recut', () => {
	it('cuts a first sentence as the cutter does', () => {
		expect(texts(recut('Plants need water.', []))).toBe('Plants|need|water|.');
	});

	it('keeps a phrase that was joined when another word is corrected', () => {
		const before = chips('Plants|need sunlight|and|watr|to|grow|.');
		expect(texts(recut('Plants need sunlight and water to grow.', before))).toBe(
			'Plants|need sunlight|and|water|to|grow|.'
		);
	});

	it('keeps the closing mark on the word it was joined to', () => {
		const before = chips('Plants|need|water|to|grow.');
		expect(texts(recut('Plants need sunlight to grow.', before))).toBe(
			'Plants|need|sunlight|to|grow.'
		);
	});

	it('keeps the words joined in a sentence written without spaces', () => {
		const before = chips('植物|需要|水|。');
		expect(texts(recut('植物需要阳光。', before))).toBe('植物|需要|阳|光|。');
	});

	it('lets go of a phrase that is no longer in the sentence', () => {
		const before = chips('Plants|need sunlight|.');
		expect(texts(recut('Plants need more sunlight.', before))).toBe('Plants|need|more|sunlight|.');
	});

	it('takes the longest phrase where two begin at the same word', () => {
		const before = chips('a b|a b c|d');
		expect(texts(recut('a b c d', before))).toBe('a b c|d');
	});

	it('keeps the id of every chip that reads as before', () => {
		const before = chips('Plants|need|water|.');
		const after = recut('Plants really need water.', before);
		expect(after.map((chip) => chip.id)).toEqual([
			before[0].id,
			expect.not.stringMatching(/^\d:/),
			before[1].id,
			before[2].id,
			before[3].id
		]);
	});

	it('keeps the id of a chip while it is being spelled', () => {
		const before = chips('Plants|ne|water');
		const after = recut('Plants nee water', before);
		expect(after.map((chip) => chip.id)).toEqual(before.map((chip) => chip.id));
	});

	it('gives the two of a repeated word their own ids', () => {
		const after = recut('the cat saw the dog', chips('the|cat|saw|the|dog'));
		expect(new Set(after.map((chip) => chip.id)).size).toBe(5);
	});
});

describe('joinChips', () => {
	it('joins two words with a space, under the id of the first', () => {
		const before = chips('Plants|need|sunlight');
		const after = joinChips(before, 1);
		expect(texts(after)).toBe('Plants|need sunlight');
		expect(after[1].id).toBe(before[1].id);
	});

	it('joins a word and the closing mark, and Chinese words, with none', () => {
		expect(texts(joinChips(chips('grow|.'), 0))).toBe('grow.');
		expect(texts(joinChips(chips('植|物|需'), 0))).toBe('植物|需');
	});

	it('leaves the sentence the chips spell as it was', () => {
		const before = sentenceToChips('Plants need sunlight and water to grow.');
		const after = joinChips(chips(before.join('|')), 2);
		expect(chipsToSentence(after.map((chip) => chip.text))).toBe(chipsToSentence(before));
	});
});

describe('cutsOf', () => {
	it('offers a cut between every two letters', () => {
		expect(cutsOf('sun').map((cut) => `${cut.head}|${cut.tail}`)).toEqual(['s|un', 'su|n']);
	});

	it('offers the cut at a space once, and leaves the space out of both halves', () => {
		expect(cutsOf('a bc').map((cut) => `${cut.head}|${cut.tail}`)).toEqual(['a|bc', 'a b|c']);
	});

	it('has nothing to offer for one letter', () => {
		expect(cutsOf('光')).toEqual([]);
		expect(cutsOf('')).toEqual([]);
	});

	it('does not cut through a letter made of several code points', () => {
		expect(cutsOf('e\u0301a').map((cut) => cut.head)).toEqual(['e\u0301']);
	});
});

describe('splitChip', () => {
	it('cuts one chip in two, the first under the old id', () => {
		const before = chips('Plants|sunlight|.');
		const after = splitChip(before, 1, cutsOf('sunlight')[2]);
		expect(texts(after)).toBe('Plants|sun|light|.');
		expect(after[1].id).toBe(before[1].id);
		expect(new Set(after.map((chip) => chip.id)).size).toBe(4);
	});
});
