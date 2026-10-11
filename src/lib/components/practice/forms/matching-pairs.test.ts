import { describe, expect, it } from 'vitest';
import { ITEM_KINDS } from '#lib/items/kinds.js';
import type { MatchingPayload } from '#lib/items/payload.js';
import { validateItem } from '#lib/items/schema.js';
import { addRow, answerOf, extrasOf, removeRow, setAnswer } from './matching-pairs.js';

/** Roots and Stem both take in water; Leaves make food; "Give off light" is an extra. */
function stored(): MatchingPayload {
	return {
		type: 'matching',
		question: 'Match each part to what it does.',
		left: [
			{ id: 'l1', text: 'Roots' },
			{ id: 'l2', text: 'Leaves' },
			{ id: 'l3', text: 'Stem' }
		],
		right: [
			{ id: 'r1', text: 'Make food' },
			{ id: 'r2', text: 'Give off light' },
			{ id: 'r3', text: 'Take in water' }
		],
		pairs: [
			{ left_id: 'l1', right_id: 'r3' },
			{ left_id: 'l2', right_id: 'r1' },
			{ left_id: 'l3', right_id: 'r3' }
		]
	};
}

/** The rows as the form shows them: `Roots>Take in water`. */
const rows = (payload: MatchingPayload) =>
	payload.left.map((left) => `${left.text}>${answerOf(payload, left.id)?.text ?? '?'}`);

describe('answerOf and extrasOf', () => {
	it('opens an answer that serves two items as two rows, and finds the extra', () => {
		const payload = stored();
		expect(rows(payload)).toEqual([
			'Roots>Take in water',
			'Leaves>Make food',
			'Stem>Take in water'
		]);
		expect(extrasOf(payload).map((item) => item.text)).toEqual(['Give off light']);
	});

	it('has no answer for an item that has no pair', () => {
		const payload = stored();
		payload.pairs.pop();
		expect(answerOf(payload, 'l3')).toBeUndefined();
	});
});

describe('setAnswer', () => {
	it('leaves the other row alone when one of two that share an answer is edited', () => {
		const payload = stored();
		setAnswer(payload, 'l3', { text: 'Take in water!' });
		expect(rows(payload)).toEqual([
			'Roots>Take in water',
			'Leaves>Make food',
			'Stem>Take in water!'
		]);
		expect(payload.right).toHaveLength(4);
		expect(answerOf(payload, 'l1')?.id).toBe('r3');
	});

	it('shares one right item again when the two rows come to read the same', () => {
		const payload = stored();
		setAnswer(payload, 'l3', { text: 'Carry water' });
		setAnswer(payload, 'l3', { text: 'Take in water' });
		expect(payload).toEqual(stored());
	});

	it('types through another row’s answer without disturbing it', () => {
		const payload = stored();
		for (const text of ['M', 'Make', 'Make food', 'Make food too']) {
			setAnswer(payload, 'l1', { text });
		}
		expect(rows(payload)).toEqual([
			'Roots>Make food too',
			'Leaves>Make food',
			'Stem>Take in water'
		]);
		expect(payload.right.map((item) => item.text).sort()).toEqual([
			'Give off light',
			'Make food',
			'Make food too',
			'Take in water'
		]);
		expect(validateItem(payload).ok).toBe(true);
	});

	it('edits an answer of its own in place', () => {
		const payload = stored();
		setAnswer(payload, 'l2', { text: 'Make their food' });
		expect(payload.right[0]).toEqual({ id: 'r1', text: 'Make their food' });
	});

	it('does not take over an extra answer that reads the same', () => {
		const payload = stored();
		setAnswer(payload, 'l2', { text: 'Give off light' });
		expect(answerOf(payload, 'l2')?.id).toBe('r1');
		expect(extrasOf(payload).map((item) => item.id)).toEqual(['r2']);
	});

	it('tells two answers apart by their pictures', () => {
		const payload = stored();
		setAnswer(payload, 'l3', { text: 'Take in water', image_path: 'upload:a' });
		expect(answerOf(payload, 'l3')?.id).not.toBe('r3');
		expect(answerOf(payload, 'l1')).toEqual({ id: 'r3', text: 'Take in water' });

		setAnswer(payload, 'l3', { text: 'Take in water', image_path: undefined });
		expect(payload).toEqual(stored());
	});

	it('never joins two rows whose answers are both empty', () => {
		const payload = ITEM_KINDS.matching.blank() as MatchingPayload;
		setAnswer(payload, payload.left[0].id, { text: 'a' });
		setAnswer(payload, payload.left[0].id, { text: '' });
		expect(payload.right).toHaveLength(2);
		expect(new Set(payload.pairs.map((pair) => pair.right_id)).size).toBe(2);
	});

	it('gives an item with no pair an answer of its own', () => {
		const payload = stored();
		payload.pairs.pop();
		setAnswer(payload, 'l3', { text: 'Hold the plant up' });
		expect(rows(payload)[2]).toBe('Stem>Hold the plant up');
	});
});

describe('addRow and removeRow', () => {
	it('adds an empty pair', () => {
		const payload = stored();
		const id = addRow(payload);
		expect(payload.left.at(-1)).toEqual({ id, text: '' });
		expect(answerOf(payload, id)).toEqual({ id: expect.any(String), text: '' });
		expect(extrasOf(payload)).toHaveLength(1);
	});

	it('keeps an answer another row still uses', () => {
		const payload = stored();
		removeRow(payload, 'l3');
		expect(rows(payload)).toEqual(['Roots>Take in water', 'Leaves>Make food']);
		expect(payload.right).toHaveLength(3);
	});

	it('takes the row’s own answer away with it, so it does not become an extra', () => {
		const payload = stored();
		removeRow(payload, 'l2');
		expect(payload.right.map((item) => item.id)).toEqual(['r2', 'r3']);
		expect(payload.pairs).toHaveLength(2);
	});
});
