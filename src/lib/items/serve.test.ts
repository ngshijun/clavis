import { describe, expect, it } from 'vitest';
import type { ItemPayload } from './payload.js';
import { serveItem } from './serve.js';

const ordering = (ids: string[], order: string[]): ItemPayload => ({
	type: 'ordering',
	question: 'Put in order',
	items: ids.map((id) => ({ id, text: id.toUpperCase() })),
	correct_order: order
});

describe('serveItem', () => {
	it('gives no answer away', () => {
		const payloads: ItemPayload[] = [
			{
				type: 'mcq',
				question: 'Q',
				options: [
					{ text: 'Leaf', is_correct: false, tip: 'KEY-TIP' },
					{ text: 'Root', is_correct: true }
				]
			},
			{ type: 'true_false', question: 'Q', answer: true },
			{
				type: 'tick_table',
				question: 'Q',
				groups: [
					{ id: 'g1', text: 'Yes' },
					{ id: 'g2', text: 'No' }
				],
				items: [{ id: 'r1', text: 'Row', group_id: 'g2' }]
			},
			{ type: 'short_answer', question: 'Q', accepted_answers: ['KEY-WORD'], tip: 'KEY-TIP' },
			{ type: 'numeric', question: 'Q', form: 'fraction', parts: [3, 4], equivalent: true },
			{
				type: 'matching',
				question: 'Q',
				left: [{ id: 'l1', text: 'Roots' }],
				right: [{ id: 'r1', text: 'Take in water' }],
				pairs: [{ left_id: 'l1', right_id: 'r1' }]
			}
		];
		for (const payload of payloads) {
			const served = JSON.stringify(serveItem(payload));
			for (const key of [
				'is_correct',
				'"answer":',
				'accepted',
				'group_id',
				'pairs',
				'parts',
				'tip'
			]) {
				expect(served, `${payload.type} leaks ${key}`).not.toContain(key);
			}
			expect(served).not.toContain('KEY-');
		}
	});

	it('numbers the options by their place', () => {
		const served = serveItem({
			type: 'mrq',
			question: 'Q',
			options: [
				{ text: 'a', is_correct: true },
				{ text: 'b', is_correct: true },
				{ text: 'c', is_correct: false, image_path: 'stages/s/c.png' }
			]
		});
		expect(served).toMatchObject({
			options: [
				{ number: 1, text: 'a', image_path: null },
				{ number: 2, text: 'b' },
				{ number: 3, text: 'c', image_path: 'stages/s/c.png' }
			]
		});
	});

	it('never deals a list in its answer’s order, and deals the same each time', () => {
		for (const ids of [
			['a', 'b'],
			['b', 'a'],
			['a', 'b', 'c'],
			['x', 'y', 'z', 'w', 'v']
		]) {
			const payload = ordering(ids, ids);
			const first = serveItem(payload);
			const dealt = 'items' in first ? first.items.map((item) => item.id) : [];
			expect(dealt).not.toEqual(ids);
			expect([...dealt].sort()).toEqual([...ids].sort());
			expect(serveItem(payload)).toEqual(first);
		}
	});

	it('never deals a sentence reading as the sentence, whichever chip carries a repeated word', () => {
		const served = serveItem({
			type: 'rearrange',
			question: 'Q',
			items: [
				{ id: 'a', text: 'the' },
				{ id: 'b', text: 'cat' },
				{ id: 'c', text: 'the' }
			],
			correct_order: ['a', 'b', 'c']
		});
		const words = 'items' in served ? served.items.map((item) => item.text) : [];
		expect(words).not.toEqual(['the', 'cat', 'the']);
	});

	it('never deals a matching with every answer beside its own item', () => {
		const served = serveItem({
			type: 'matching',
			question: 'Q',
			left: [
				{ id: 'l1', text: '1' },
				{ id: 'l2', text: '2' }
			],
			right: [
				{ id: 'r1', text: 'a' },
				{ id: 'r2', text: 'b' }
			],
			pairs: [
				{ left_id: 'l1', right_id: 'r1' },
				{ left_id: 'l2', right_id: 'r2' }
			]
		});
		expect('right' in served && served.right.map((entry) => entry.id)).toEqual(['r2', 'r1']);
	});

	it('builds a word bank of each answer once and the extra words', () => {
		const served = serveItem({
			type: 'cloze',
			text: '{{1}} and {{2}}',
			mode: 'bank',
			reuse: true,
			blanks: [
				{ index: 1, accepted: ['root', 'roots'] },
				{ index: 2, accepted: ['root'] }
			],
			distractors: ['leaf', 'root']
		});
		expect(served).toMatchObject({
			mode: 'bank',
			reuse: true,
			blanks: [{ index: 1 }, { index: 2 }]
		});
		expect('bank' in served && [...(served.bank ?? [])].sort()).toEqual(['leaf', 'root']);
	});

	it('reads the defaults a payload leaves out', () => {
		expect(
			serveItem({ type: 'cloze', text: '{{1}}', blanks: [{ index: 1, accepted: ['x'] }] })
		).toMatchObject({
			mode: 'typing',
			reuse: false,
			bank: null
		});
		expect(serveItem({ type: 'numeric', question: 'Q', answer: 2, unit: 'cm' })).toMatchObject({
			form: 'number',
			unit: 'cm',
			clock: null,
			terms: null
		});
		expect(
			serveItem({ type: 'numeric', question: 'Q', form: 'time', parts: [17, 50], period: null })
		).toMatchObject({ clock: 24 });
		expect(
			serveItem({ type: 'word_completion', question: 'Q', answer: 'leaf', reveal_first: true })
		).toMatchObject({ length: 4, first_letter: 'l' });
	});
});
