import { describe, expect, it } from 'vitest';
import { comparable, isAbsent } from './absent.js';

describe('isAbsent', () => {
	it('is true of what says nothing: left out, emptied, switched off, an empty list', () => {
		for (const value of [undefined, null, '', false, []]) expect(isAbsent(value)).toBe(true);
	});

	it('is false of what says something, a zero among them', () => {
		for (const value of [0, NaN, ' ', 'no', true, ['a'], [''], {}]) {
			expect(isAbsent(value)).toBe(false);
		}
	});
});

describe('comparable', () => {
	const same = (a: unknown, b: unknown) =>
		expect(JSON.stringify(comparable(a))).toBe(JSON.stringify(comparable(b)));
	const different = (a: unknown, b: unknown) =>
		expect(JSON.stringify(comparable(a))).not.toBe(JSON.stringify(comparable(b)));

	it('takes a key that says nothing for a key that is not there, at every depth', () => {
		same(
			{ question: 'Q', tip: '', image_path: null, reuse: false, distractors: [], unit: undefined },
			{ question: 'Q' }
		);
		same({ options: [{ text: 'A', tip: '' }] }, { options: [{ text: 'A' }] });
	});

	it('does not mind the order of the keys, and does mind the order of a list', () => {
		same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 });
		different({ list: ['a', 'b'] }, { list: ['b', 'a'] });
	});

	it('keeps what says something', () => {
		different({ answer: true }, { answer: false });
		different({ tolerance: 0 }, {});
		different({ period: 'am' }, { period: null });
		different({ text: 'Root' }, { text: 'root' });
	});

	it('leaves the value it was given as it was', () => {
		const given = { tip: '', options: [{ text: 'A', tip: null }] };
		comparable(given);
		expect(given).toEqual({ tip: '', options: [{ text: 'A', tip: null }] });
	});
});
