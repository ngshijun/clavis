import { describe, expect, it } from 'vitest';
import { sentenceToWords } from '#lib/items/text.js';
import { carryMarks } from './pick-words-marks.js';

/** A sentence with its answers in asterisks: `The *roots* grow`. */
function marked(sentence: string) {
	return sentenceToWords(sentence).map((word) => {
		const is_correct = word.startsWith('*') && word.endsWith('*');
		return { text: is_correct ? word.slice(1, -1) : word, is_correct };
	});
}

/** The sentence `before` becomes when it is edited to read `after`, in the same notation. */
function edit(before: string, after: string): string {
	return carryMarks(marked(before), sentenceToWords(after))
		.map((word) => (word.is_correct ? `*${word.text}*` : word.text))
		.join(' ');
}

describe('carryMarks', () => {
	it('marks nothing in a sentence written from nothing', () => {
		expect(edit('', 'The roots grow')).toBe('The roots grow');
	});

	it('keeps every mark when the words did not change', () => {
		expect(edit('The *roots* grow *down*', 'The roots  grow down ')).toBe(
			'The *roots* grow *down*'
		);
	});

	it('keeps the marks when a word is added at the end', () => {
		expect(edit('The *roots* grow', 'The roots grow d')).toBe('The *roots* grow d');
	});

	it('keeps the marks behind a word added in front of them', () => {
		expect(edit('The *roots* grow *down*', 'The long roots grow down')).toBe(
			'The long *roots* grow *down*'
		);
	});

	it('keeps the marks around a word that is removed', () => {
		expect(edit('*The* roots *grow* down', 'The grow down')).toBe('*The* *grow* down');
		expect(edit('The *roots* grow', 'The grow')).toBe('The grow');
	});

	it('keeps the mark of a word that is spelled again', () => {
		expect(edit('The *rots* grow', 'The roots grow')).toBe('The *roots* grow');
		expect(edit('The *roots* grow', 'The roots, grow')).toBe('The *roots,* grow');
	});

	it('does not mark a plain word that is spelled again', () => {
		expect(edit('The rots *grow*', 'The roots grow')).toBe('The roots *grow*');
	});

	it('drops the mark of a word cut in two, and of two joined into one', () => {
		expect(edit('The *sunflower* grows', 'The sun flower grows')).toBe('The sun flower grows');
		expect(edit('The *sun* *flower* grows', 'The sunflower grows')).toBe('The sunflower grows');
	});

	it('keeps the right marks among words that repeat', () => {
		expect(edit('the *the* the', 'the the the the')).toBe('the *the* the the');
		expect(edit('*a* b', 'a')).toBe('*a*');
	});

	it('marks nothing in a sentence replaced by another', () => {
		expect(edit('*Roots* take in *water*', 'Leaves make food from light')).toBe(
			'Leaves make food from light'
		);
	});
});
