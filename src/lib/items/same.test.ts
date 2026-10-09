import { describe, expect, it } from 'vitest';
import type {
	ClassifyPayload,
	ClozePayload,
	MatchingPayload,
	McqPayload,
	NumericPayload,
	OrderingPayload,
	TickTablePayload
} from './payload.js';
import { contentKey } from './same.js';

const mcq: McqPayload = {
	type: 'mcq',
	question: 'Which part of a plant takes in water?',
	options: [
		{ text: 'Roots', is_correct: true },
		{ text: 'Stem', is_correct: false, tip: 'It carries the water.' }
	]
};

const matching: MatchingPayload = {
	type: 'matching',
	question: 'Match each animal to its young.',
	left: [
		{ id: 'l1', text: 'Cat' },
		{ id: 'l2', text: 'Dog' }
	],
	right: [
		{ id: 'r1', text: 'Kitten' },
		{ id: 'r2', text: 'Puppy' },
		{ id: 'r3', text: 'Chick' }
	],
	pairs: [
		{ left_id: 'l1', right_id: 'r1' },
		{ left_id: 'l2', right_id: 'r2' }
	]
};

const ordering: OrderingPayload = {
	type: 'ordering',
	question: 'Put them in order.',
	items: [
		{ id: 'a', text: 'Egg' },
		{ id: 'b', text: 'Caterpillar' },
		{ id: 'c', text: 'Butterfly' }
	],
	correct_order: ['a', 'b', 'c']
};

const tickTable: TickTablePayload = {
	type: 'tick_table',
	question: 'Tick the right column.',
	groups: [
		{ id: 'g1', text: 'Living' },
		{ id: 'g2', text: 'Non-living' }
	],
	items: [
		{ id: 'i1', text: 'Cat', group_id: 'g1' },
		{ id: 'i2', text: 'Rock', group_id: 'g2' }
	]
};

describe('contentKey', () => {
	it('is the same for a question written again', () => {
		expect(contentKey(structuredClone(mcq))).toBe(contentKey(mcq));
	});

	it('minds neither capitals nor the spaces around the words', () => {
		const typed: McqPayload = {
			...mcq,
			question: '  WHICH part of a plant takes in water?  ',
			options: [
				{ text: ' roots', is_correct: true },
				{ text: 'STEM ', is_correct: false }
			]
		};
		expect(contentKey(typed)).toBe(contentKey(mcq));
	});

	it('does not mind tips, on the question or inside it', () => {
		const tipped: McqPayload = {
			...mcq,
			tip: 'Look under the ground.',
			options: [
				{ text: 'Roots', is_correct: true },
				{ text: 'Stem', is_correct: false, tip: 'That holds the plant up.' }
			]
		};
		expect(contentKey(tipped)).toBe(contentKey(mcq));
	});

	it('tells questions apart by their pictures, on the question or inside it', () => {
		const plant = 'a'.repeat(32);
		const roots = 'b'.repeat(32);
		const pictured = (question: string, option: string): McqPayload => ({
			...mcq,
			image_path: question,
			options: [
				{ text: '', is_correct: true, image_path: option },
				{ text: 'Stem', is_correct: false }
			]
		});
		const stored = pictured(`stages/s/${plant}-1.webp`, `stages/s/${roots}-2.webp`);
		expect(contentKey(stored)).not.toBe(contentKey(mcq));
		expect(contentKey(pictured(`stages/s/${roots}-1.webp`, `stages/s/${roots}-2.webp`))).not.toBe(
			contentKey(stored)
		);
		expect(contentKey(pictured(`stages/s/${plant}-1.webp`, `stages/s/${plant}-2.webp`))).not.toBe(
			contentKey(stored)
		);
	});

	it('knows a picture by its fingerprint, wherever it is stored and before it is', () => {
		const plant = 'a'.repeat(32);
		const pictured = (path: string): McqPayload => ({ ...mcq, image_path: path });
		const stored = contentKey(pictured(`stages/s/${plant}-1.webp`));
		expect(contentKey(pictured(`stages/s/${plant}-2.webp`))).toBe(stored);
		expect(contentKey(pictured(`upload:${plant}`))).toBe(stored);

		// The pictures of what a pupil moves count the same way.
		const paired = (path: string): MatchingPayload => ({
			...matching,
			left: matching.left.map((item, index) => (index === 0 ? { ...item, image_path: path } : item))
		});
		expect(contentKey(paired(`upload:${plant}`))).toBe(
			contentKey(paired(`stages/s/${plant}-9.webp`))
		);
		expect(contentKey(paired(`upload:${plant}`))).not.toBe(contentKey(matching));
	});

	it('tells questions apart by their words, their answers and their type', () => {
		const keys = [
			mcq,
			{ ...mcq, question: 'Which part of a plant makes food?' },
			{ ...mcq, type: 'mrq' as const },
			{
				...mcq,
				options: [
					{ text: 'Roots', is_correct: false },
					{ text: 'Stem', is_correct: true }
				]
			},
			{ ...mcq, options: [...mcq.options, { text: 'Leaf', is_correct: false }] }
		].map(contentKey);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('does not mind which ids the editor made up', () => {
		const again: MatchingPayload = {
			...matching,
			left: [
				{ id: 'x', text: 'Cat' },
				{ id: 'y', text: 'Dog' }
			],
			right: [
				{ id: 'p', text: 'Kitten' },
				{ id: 'q', text: 'Puppy' },
				{ id: 'r', text: 'Chick' }
			],
			pairs: [
				{ left_id: 'x', right_id: 'p' },
				{ left_id: 'y', right_id: 'q' }
			]
		};
		expect(contentKey(again)).toBe(contentKey(matching));

		const renamed: TickTablePayload = {
			...tickTable,
			groups: [
				{ id: 'one', text: 'Living' },
				{ id: 'two', text: 'Non-living' }
			],
			items: [
				{ id: 'a', text: 'Cat', group_id: 'one' },
				{ id: 'b', text: 'Rock', group_id: 'two' }
			]
		};
		expect(contentKey(renamed)).toBe(contentKey(tickTable));
	});

	it('follows an id to the words it points at, so another answer is another question', () => {
		const swapped: MatchingPayload = {
			...matching,
			pairs: [
				{ left_id: 'l1', right_id: 'r2' },
				{ left_id: 'l2', right_id: 'r1' }
			]
		};
		expect(contentKey(swapped)).not.toBe(contentKey(matching));

		const moved: TickTablePayload = {
			...tickTable,
			items: [
				{ id: 'i1', text: 'Cat', group_id: 'g2' },
				{ id: 'i2', text: 'Rock', group_id: 'g1' }
			]
		};
		expect(contentKey(moved)).not.toBe(contentKey(tickTable));

		const sorted: ClassifyPayload = { ...tickTable, type: 'classify' };
		expect(contentKey(sorted)).not.toBe(contentKey(tickTable));
	});

	it('takes the order of an Ordering from its answer, not from how the items are stored', () => {
		const shuffled: OrderingPayload = {
			...ordering,
			items: [ordering.items[2], ordering.items[0], ordering.items[1]]
		};
		expect(contentKey(shuffled)).toBe(contentKey(ordering));
		expect(contentKey({ ...ordering, correct_order: ['c', 'b', 'a'] })).not.toBe(
			contentKey(ordering)
		);
	});

	it('counts the extra answers of a Matching, in any order', () => {
		const more: MatchingPayload = {
			...matching,
			right: [...matching.right, { id: 'r4', text: 'Calf' }]
		};
		const turned: MatchingPayload = {
			...more,
			right: [more.right[3], more.right[2], more.right[0], more.right[1]]
		};
		expect(contentKey(more)).not.toBe(contentKey(matching));
		expect(contentKey(turned)).toBe(contentKey(more));
	});

	it('reads a key that says nothing as a key that is not there', () => {
		const cloze: ClozePayload = {
			type: 'cloze',
			text: 'The {{1}} take in water.',
			blanks: [{ index: 1, accepted: ['roots'] }]
		};
		expect(contentKey({ ...cloze, question: '', distractors: [], reuse: false })).toBe(
			contentKey(cloze)
		);
		expect(contentKey({ ...cloze, mode: 'bank' })).not.toBe(contentKey(cloze));

		// A zero is an answer, and says something.
		const number: NumericPayload = { type: 'numeric', question: 'How many?', answer: 0 };
		expect(contentKey({ ...number, unit: null, tolerance: undefined })).toBe(contentKey(number));
		expect(contentKey({ ...number, answer: 1 })).not.toBe(contentKey(number));
		expect(contentKey({ ...number, form: 'money' })).not.toBe(contentKey(number));
	});
});
