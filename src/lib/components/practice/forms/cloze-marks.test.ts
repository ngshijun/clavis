import { describe, expect, it } from 'vitest';
import { clozeFromBrackets } from '#lib/items/text.js';
import { addMark, carry, editOf, fold, markAt, unfold, type Mark } from './cloze-marks.js';

/** The written text and its marks, from a text with each blank's answers in brackets. */
const written = (brackets: string) => unfold(clozeFromBrackets(brackets));

/** The same notation back: `The [roots|root] take in water.` */
function brackets(source: string, marks: Mark[]): string {
	const { text, blanks } = fold(source, marks, 'typing');
	return text.replace(/\{\{(\d+)\}\}/g, (_, index: string) => {
		const blank = blanks.find((each) => each.index === Number(index));
		return `[${(blank?.accepted ?? []).join('|')}]`;
	});
}

/**
 * What a marked text becomes when it is edited to read each of `edits` in
 * turn. An edit is the new text, or the new text and where it left the caret
 * (by default at the end of what was typed, found by taking the two texts
 * apart from their ends).
 */
function retype(before: string, ...edits: (string | [after: string, caret: number])[]): string {
	let { source, marks } = written(before);
	let open = -1;
	for (const edit of edits) {
		const [after, caret] = typeof edit === 'string' ? [edit, edit.length] : edit;
		({ marks, open } = carry(after, marks, editOf(source, after, caret), open));
		source = after;
	}
	return brackets(source, marks);
}

describe('unfold and fold', () => {
	it('writes the text out whole and marks each answer', () => {
		const { source, marks } = written('The [roots|root] take in water. The [stem] carries it.');
		expect(source).toBe('The roots take in water. The stem carries it.');
		expect(marks).toEqual([
			{ start: 4, end: 9, others: ['root'], wrong: [] },
			{ start: 29, end: 33, others: [], wrong: [] }
		]);
	});

	it('gives back what was stored', () => {
		const stored = {
			text: 'The {{1}} makes seeds. Bees carry {{2}}.',
			blanks: [
				{ index: 1, accepted: ['flower'], choices: ['flower', 'leaf', 'root'] },
				{ index: 2, accepted: ['pollen', 'Pollen'] }
			]
		};
		const { source, marks } = unfold(stored);
		expect(fold(source, marks, 'choices')).toEqual(stored);
	});

	it('numbers the blanks in reading order and puts the answer first among the choices', () => {
		const { source, marks } = unfold({
			text: '{{7}} and {{2}}',
			blanks: [
				{ index: 2, accepted: ['b'], choices: ['x', 'b'] },
				{ index: 7, accepted: ['a'] }
			]
		});
		expect(fold(source, marks, 'choices')).toEqual({
			text: '{{1}} and {{2}}',
			blanks: [
				{ index: 1, accepted: ['a'] },
				{ index: 2, accepted: ['b'], choices: ['b', 'x'] }
			]
		});
	});

	it('writes choices only where pupils answer by choosing', () => {
		const { source, marks } = unfold({
			text: 'The {{1}} makes seeds.',
			blanks: [{ index: 1, accepted: ['flower'], choices: ['flower', 'leaf'] }]
		});
		for (const mode of ['typing', 'bank'] as const) {
			expect(fold(source, marks, mode).blanks).toEqual([{ index: 1, accepted: ['flower'] }]);
		}
		// The wrong choices stay with the mark, for when pupils are to choose again.
		expect(marks[0].wrong).toEqual(['leaf']);
	});

	it('leaves out a placeholder that has no answer', () => {
		expect(unfold({ text: 'A {{1}} b', blanks: [] })).toEqual({ source: 'A  b', marks: [] });
	});
});

describe('editOf', () => {
	it('finds what was typed', () => {
		expect(editOf('The stem', 'The green stem', 10)).toEqual({ start: 4, end: 4, inserted: 6 });
	});

	it('uses the caret to tell two like letters apart', () => {
		// The first `o` of `roots` was deleted, not the second.
		expect(editOf('roots', 'rots', 1)).toEqual({ start: 1, end: 2, inserted: 0 });
		expect(editOf('roots', 'rots', 2)).toEqual({ start: 2, end: 3, inserted: 0 });
	});

	it('copes with a caret that is not where the change ended', () => {
		// The space in front of `stem` may as well be the one that was there before.
		expect(editOf('The stem', 'The green stem', 0)).toEqual({ start: 3, end: 3, inserted: 6 });
		expect(editOf('abc', 'xyz', 0)).toEqual({ start: 0, end: 3, inserted: 3 });
	});

	it('sees no change in the same text', () => {
		expect(editOf('roots', 'roots', 2)).toEqual({ start: 2, end: 2, inserted: 0 });
	});
});

describe('editing a marked text', () => {
	it('moves a blank along with what is typed before it', () => {
		expect(retype('The [roots] grow', ['All the roots grow', 7])).toBe('All the [roots] grow');
	});

	it('keeps what is typed against either end of a blank out of it', () => {
		expect(retype('The [roots]', 'The roots grow')).toBe('The [roots] grow');
		expect(retype('[roots] grow', ['The roots grow', 4])).toBe('The [roots] grow');
	});

	it('takes what is typed inside an answer into it', () => {
		expect(retype('The [rots|root] grow', ['The roots grow', 6])).toBe('The [roots|root] grow');
	});

	it('shortens an answer letter by letter, and drops the blank with its last letter', () => {
		expect(retype('The [roots] grow', ['The root grow', 8])).toBe('The [root] grow');
		expect(retype('A [b] c', ['A  c', 2])).toBe('A  c');
	});

	it('drops a blank that is deleted or typed over whole', () => {
		expect(retype('The [roots] grow', ['The  grow', 4])).toBe('The  grow');
		expect(retype('The [roots] grow', ['The x grow', 5])).toBe('The x grow');
		expect(retype('The [roots] and [stem] grow', ['They grow', 3])).toBe('They grow');
	});

	it('keeps the part of an answer that an edit left standing', () => {
		expect(retype('The [big roots] grow', ['Theroots grow', 3])).toBe('The[roots] grow');
		expect(retype('The [big roots] grow', ['The big', 7])).toBe('The [big]');
	});

	it('leaves a space at the end of an answer in the text, outside the blank', () => {
		expect(retype('The [big roots] grow', ['The  roots grow', 4])).toBe('The  [roots] grow');
		expect(retype('The [big roots] grow', ['The big  grow', 8])).toBe('The [big]  grow');
	});

	it('drops a blank that is left with nothing but spaces', () => {
		expect(retype('[a b] c', ['a  c', 1], [' c', 0])).toBe(' c');
	});

	it('goes on with an answer whose end was deleted and is typed again', () => {
		const typed = ['The lea grow', 'The leav grow', 'The leave grow', 'The leaves grow'].map(
			(after, at): [string, number] => [after, 7 + at]
		);
		expect(retype('The [leafs|leaf] grow', ...typed)).toBe('The [leaves|leaf] grow');
		// The second word of an answer too, across the space that is left for a moment.
		expect(retype('The [big roots] grow', ['The big  grow', 8], ['The big tree grow', 12])).toBe(
			'The [big tree] grow'
		);
	});

	it('does not go on with an answer once something else was edited', () => {
		expect(retype('The [roots] grow', ['The root grow', 8], ['The root grow!', 14])).toBe(
			'The [root] grow!'
		);
		expect(retype('[roots] grow', ['root grow', 4], ['root grows', 10], ['roots grows', 5])).toBe(
			'[root]s grows'
		);
	});
});

describe('addMark', () => {
	const sentence = written('The roots take in water.');

	it('makes the selected words a blank, without the spaces around them', () => {
		const marks = addMark(sentence.source, sentence.marks, { start: 3, end: 10 });
		expect(brackets(sentence.source, marks)).toBe('The [roots] take in water.');
	});

	it('makes nothing of a selection with no words in it', () => {
		expect(addMark(sentence.source, sentence.marks, { start: 3, end: 4 })).toEqual([]);
		expect(addMark(sentence.source, sentence.marks, { start: 5, end: 5 })).toEqual([]);
	});

	it('keeps the blanks in reading order', () => {
		const { source, marks } = written('The roots take in [water].');
		expect(brackets(source, addMark(source, marks, { start: 4, end: 9 }))).toBe(
			'The [roots] take in [water].'
		);
	});

	it('widens a blank that is selected again and keeps its other answers', () => {
		const { source, marks } = written('The [root|akar]s grow');
		expect(brackets(source, addMark(source, marks, { start: 4, end: 9 }))).toBe(
			'The [roots|akar] grow'
		);
	});

	it('makes one blank of a selection over several', () => {
		const { source, marks } = written('The [big|large] [roots|root] grow');
		expect(brackets(source, addMark(source, marks, { start: 4, end: 13 }))).toBe(
			'The [big roots] grow'
		);
	});
});

describe('markAt', () => {
	const { marks } = written('The [roots] grow');

	it('finds the blank the caret is in or against', () => {
		expect(markAt(marks, { start: 4, end: 4 })).toBe(marks[0]);
		expect(markAt(marks, { start: 6, end: 6 })).toBe(marks[0]);
		expect(markAt(marks, { start: 9, end: 9 })).toBe(marks[0]);
		expect(markAt(marks, { start: 3, end: 3 })).toBeUndefined();
	});

	it('finds the blank a selection stays within, and none for one that reaches out of it', () => {
		expect(markAt(marks, { start: 4, end: 9 })).toBe(marks[0]);
		expect(markAt(marks, { start: 2, end: 9 })).toBeUndefined();
	});
});
