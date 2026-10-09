import { describe, expect, it } from 'vitest';
import { keyOf } from './key.js';

describe('keyOf', () => {
	it('picks the right option of a Multiple Choice, which has one part', () => {
		expect(
			keyOf({
				type: 'mcq',
				question: 'Next?',
				options: [
					{ text: '31', is_correct: false },
					{ text: '35', is_correct: true }
				]
			})
		).toEqual({ answer: { selected_options: [2] }, parts: [] });
	});

	it('picks every right option of a Multiple Response and of Pick the Words, each a part', () => {
		const options = [
			{ text: 'a', is_correct: true },
			{ text: 'b', is_correct: false },
			{ text: 'c', is_correct: true }
		];
		const key = { answer: { selected_options: [1, 3] }, parts: ['1', '3'] };
		expect(keyOf({ type: 'mrq', question: 'Which?', options })).toEqual(key);
		expect(keyOf({ type: 'pick_words', question: 'Which?', options })).toEqual(key);
	});

	it('answers a True or False', () => {
		expect(keyOf({ type: 'true_false', question: 'Is it?', answer: false })).toEqual({
			answer: { response: { value: false } },
			parts: []
		});
	});

	it('puts each row of a tick table and each item of a Classify under its group', () => {
		const groups = [
			{ id: 'g1', text: 'Odd' },
			{ id: 'g2', text: 'Even' }
		];
		const items = [
			{ id: 'a', text: '6', group_id: 'g2' },
			{ id: 'b', text: '9', group_id: 'g1' }
		];
		const key = {
			answer: {
				response: {
					items: [
						{ id: 'a', group_id: 'g2' },
						{ id: 'b', group_id: 'g1' }
					]
				}
			},
			parts: ['a', 'b']
		};
		expect(keyOf({ type: 'tick_table', question: 'Sort', groups, items })).toEqual(key);
		expect(keyOf({ type: 'classify', question: 'Sort', groups, items })).toEqual(key);
	});

	it('fills each blank with the first answer it accepts', () => {
		expect(
			keyOf({
				type: 'cloze',
				text: '5, 10, {{1}}, 20, {{2}}',
				blanks: [
					{ index: 1, accepted: ['15', 'fifteen'] },
					{ index: 2, accepted: ['25'] }
				]
			})
		).toEqual({
			answer: {
				response: {
					blanks: [
						{ index: 1, value: '15' },
						{ index: 2, value: '25' }
					]
				}
			},
			parts: ['1', '2']
		});
	});

	it('gives the first accepted answer of a Short Answer', () => {
		expect(
			keyOf({ type: 'short_answer', question: 'Name it', accepted_answers: ['leaf', 'leaves'] })
		).toEqual({ answer: { text_answer: 'leaf' }, parts: [] });
	});

	it('gives the letters of a Word Completion without its spaces', () => {
		expect(keyOf({ type: 'word_completion', question: 'Spell it', answer: 'ice cream' })).toEqual({
			answer: { text_answer: 'icecream' },
			parts: []
		});
	});

	it('writes a number as it is typed, and money to the sen', () => {
		expect(keyOf({ type: 'numeric', question: '18 + 7', answer: 25 })).toEqual({
			answer: { text_answer: '25' },
			parts: []
		});
		expect(keyOf({ type: 'numeric', form: 'number', question: 'Long?', answer: 9.5 })).toEqual({
			answer: { text_answer: '9.5' },
			parts: []
		});
		expect(keyOf({ type: 'numeric', form: 'money', question: 'Cost?', answer: 19.2 })).toEqual({
			answer: { text_answer: '19.20' },
			parts: []
		});
	});

	it('fills the boxes of a number given in parts, with the half of the day for a time', () => {
		expect(keyOf({ type: 'numeric', form: 'fraction', question: 'Half', parts: [1, 2] })).toEqual({
			answer: { response: { parts: [1, 2] } },
			parts: []
		});
		expect(
			keyOf({ type: 'numeric', form: 'time', question: 'When?', parts: [7, 30], period: 'pm' })
		).toEqual({ answer: { response: { parts: [7, 30], period: 'pm' } }, parts: [] });
		expect(
			keyOf({ type: 'numeric', form: 'time', question: 'When?', parts: [19, 30], period: null })
		).toEqual({ answer: { response: { parts: [19, 30], period: null } }, parts: [] });
	});

	it('joins every left item of a Matching to its answer', () => {
		expect(
			keyOf({
				type: 'matching',
				question: 'Join',
				left: [
					{ id: 'l1', text: '12' },
					{ id: 'l2', text: '20' }
				],
				right: [
					{ id: 'r1', text: 'twenty' },
					{ id: 'r2', text: 'twelve' },
					{ id: 'r3', text: 'two' }
				],
				pairs: [
					{ left_id: 'l1', right_id: 'r2' },
					{ left_id: 'l2', right_id: 'r1' }
				]
			})
		).toEqual({
			answer: {
				response: {
					pairs: [
						{ left_id: 'l1', right_id: 'r2' },
						{ left_id: 'l2', right_id: 'r1' }
					]
				}
			},
			parts: ['l1', 'l2']
		});
	});

	it('puts an Ordering in order, each place a part, and a Rearrange as one', () => {
		const items = [
			{ id: 'x', text: 'seed' },
			{ id: 'y', text: 'shoot' }
		];
		expect(
			keyOf({ type: 'ordering', question: 'Order', items, correct_order: ['x', 'y'] })
		).toEqual({ answer: { response: { order: ['x', 'y'] } }, parts: ['x', 'y'] });
		expect(
			keyOf({ type: 'rearrange', question: 'Order', items, correct_order: ['y', 'x'] })
		).toEqual({ answer: { response: { order: ['y', 'x'] } }, parts: [] });
	});

	it('names every part of a picture', () => {
		expect(
			keyOf({
				type: 'label_picture',
				question: 'Label',
				image_path: 'plant.png',
				mode: 'typing',
				labels: [
					{ id: 'p', text: 'Leaf', x: 10, y: 20 },
					{ id: 'q', text: 'Stem', x: 30, y: 40 }
				]
			})
		).toEqual({
			answer: {
				response: {
					labels: [
						{ id: 'p', value: 'Leaf' },
						{ id: 'q', value: 'Stem' }
					]
				}
			},
			parts: ['p', 'q']
		});
	});
});
