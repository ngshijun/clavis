import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import {
	MAX_ENTRIES,
	MAX_ENTRY_CHARS,
	MAX_ID_CHARS,
	MAX_QUESTION_CHARS,
	MAX_TIP_CHARS,
	MAX_UNIT_CHARS,
	MAX_WORDS
} from './limits.js';
import { ITEM_TYPES, NUMERIC_FORMS, type ItemPayload } from './payload.js';
import { chars, issueAt, storable, validateItem } from './schema.js';

/** One complete question of every type, and of every Number form, already tidy. */
const complete = {
	mcq: {
		type: 'mcq',
		question: 'Which part of a plant takes in water from the soil?',
		options: [
			{ text: 'Leaf', is_correct: false, tip: 'Leaves make food.' },
			{ text: 'Root', is_correct: true },
			{ text: '', is_correct: false, image_path: 'stages/s/stem.png' }
		]
	},
	mrq: {
		type: 'mrq',
		question: 'Tick two things a plant needs to make its own food.',
		options: [
			{ text: 'Sunlight', is_correct: true },
			{ text: 'Water', is_correct: true },
			{ text: 'Darkness', is_correct: false }
		]
	},
	true_false: {
		type: 'true_false',
		question: 'Kaktus menyimpan air di dalam batangnya.',
		tip: 'Batang kaktus tebal.',
		answer: true,
		labels: ['Betul', 'Salah']
	},
	tick_table: {
		type: 'tick_table',
		question: 'Tick the part of the plant that does each job.',
		groups: [
			{ id: 'g1', text: 'Roots' },
			{ id: 'g2', text: 'Stem' },
			{ id: 'g3', text: 'Leaves' }
		],
		items: [
			{ id: 'r1', text: 'Takes in water from the soil', group_id: 'g1' },
			{ id: 'r2', text: 'Makes food using sunlight', group_id: 'g3' }
		]
	},
	pick_words: {
		type: 'pick_words',
		question: 'Underline the part of the plant that takes in water.',
		options: [
			{ text: 'The', is_correct: false },
			{ text: 'roots', is_correct: true },
			{ text: 'grow', is_correct: false },
			{ text: 'down.', is_correct: false }
		]
	},
	cloze: {
		type: 'cloze',
		text: 'The {{1}} take in water. The {{2}} carries it.',
		blanks: [
			{ index: 1, accepted: ['roots', 'root'] },
			{ index: 2, accepted: ['stem'] }
		]
	},
	short_answer: {
		type: 'short_answer',
		question: 'Name the green substance in leaves that traps sunlight.',
		accepted_answers: ['chlorophyll', 'klorofil']
	},
	word_completion: {
		type: 'word_completion',
		question: 'The flat green part of a plant that makes food.',
		answer: 'leaf',
		reveal_first: true
	},
	matching: {
		type: 'matching',
		question: 'Match each part of a plant to what it does.',
		left: [
			{ id: 'l1', text: 'Roots' },
			{ id: 'l2', text: 'Root hairs' },
			{ id: 'l3', text: '', image_path: 'stages/s/leaf.png' }
		],
		right: [
			{ id: 'r1', text: 'Take in water' },
			{ id: 'r2', text: 'Make food' },
			{ id: 'r3', text: 'Give off light' }
		],
		// One answer serves two items, and one is left over.
		pairs: [
			{ left_id: 'l1', right_id: 'r1' },
			{ left_id: 'l2', right_id: 'r1' },
			{ left_id: 'l3', right_id: 'r2' }
		]
	},
	ordering: {
		type: 'ordering',
		question: 'Put the stages of a bean plant’s growth in order.',
		items: [
			{ id: 'a', text: 'Seedling' },
			{ id: 'b', text: 'Seed' },
			{ id: 'c', text: '', image_path: 'stages/s/adult.png' }
		],
		correct_order: ['b', 'a', 'c']
	},
	rearrange: {
		type: 'rearrange',
		question: 'Arrange the words to make a sentence.',
		items: [
			{ id: 'a', text: 'the' },
			{ id: 'b', text: 'cat' },
			{ id: 'c', text: 'saw' },
			{ id: 'd', text: 'the' },
			{ id: 'e', text: 'dog' },
			{ id: 'f', text: '.' }
		],
		correct_order: ['a', 'b', 'c', 'd', 'e', 'f']
	},
	classify: {
		type: 'classify',
		question: 'Sort the plants into two groups.',
		groups: [
			{ id: 'g1', text: 'Flowering plants' },
			{ id: 'g2', text: 'Non-flowering plants' }
		],
		items: [
			{ id: 'i1', text: 'Hibiscus', group_id: 'g1' },
			{ id: 'i2', text: 'Fern', group_id: 'g2' },
			{ id: 'i3', text: '', image_path: 'stages/s/moss.png', group_id: 'g2' }
		]
	},
	label_picture: {
		type: 'label_picture',
		question: 'Label the parts of the plant.',
		image_path: 'stages/s/plant.png',
		labels: [
			{ id: 'a', text: 'Flower', x: 66, y: 18 },
			{ id: 'b', text: 'Leaf', x: 76.5, y: 37 }
		],
		mode: 'bank',
		distractors: ['Seed']
	},
	number: {
		type: 'numeric',
		question: 'How tall is it after 3 weeks?',
		answer: 8.1,
		tolerance: 0.05,
		unit: 'cm'
	},
	fraction: {
		type: 'numeric',
		form: 'fraction',
		question: 'What fraction of the seeds sprouted?',
		parts: [3, 4],
		equivalent: true
	},
	mixed: {
		type: 'numeric',
		form: 'mixed',
		question: 'How much water do 5 pots need?',
		parts: [2, 1, 2],
		improper: true,
		unit: 'ℓ'
	},
	ratio: {
		type: 'numeric',
		form: 'ratio',
		question: 'What is the ratio of rose plants to orchid plants to ferns?',
		parts: [5, 7, 2]
	},
	money: {
		type: 'numeric',
		form: 'money',
		question: 'A pot costs RM4.80. How much do 4 pots cost?',
		answer: 19.2
	},
	time: {
		type: 'numeric',
		form: 'time',
		question: 'At what time does it end?',
		parts: [5, 50],
		period: 'pm'
	},
	measure: {
		type: 'numeric',
		form: 'measure',
		question: 'How much water is in each tray?',
		parts: [2, 150],
		units: ['ℓ', 'mℓ']
	}
} satisfies Record<string, ItemPayload>;

/** A complete question with some of its keys replaced, to break one thing at a time. */
function broken(name: keyof typeof complete, changes: Record<string, unknown>) {
	return { ...complete[name], ...changes };
}

/** Where a payload is refused, each path written `like.this.0`. */
function refusedAt(payload: unknown): string[] {
	const result = validateItem(payload);
	return result.ok ? [] : result.issues.map((issue) => issue.path.join('.'));
}

function messageAt(payload: unknown, ...path: (string | number)[]) {
	const result = validateItem(payload);
	return result.ok ? undefined : issueAt(result.issues, ...path);
}

/** What is stored for a payload, or the refusals when it is not accepted. */
function stored(payload: unknown) {
	const result = validateItem(payload);
	return result.ok ? result.payload : result.issues;
}

describe('validateItem', () => {
	it('has a complete question here for every type and every Number form', () => {
		const types = new Set(Object.values(complete).map((payload) => payload.type));
		expect([...types].sort()).toEqual([...ITEM_TYPES].sort());
		for (const form of NUMERIC_FORMS) expect(complete).toHaveProperty(form);
	});

	it.each(Object.entries(complete))(
		'accepts a complete %s and stores it as written',
		(_, payload) => {
			expect(validateItem(payload)).toStrictEqual({ ok: true, payload });
		}
	);

	it('trims text, drops unknown keys and leaves empty optional values out', () => {
		expect(
			stored({
				type: 'mcq',
				question: '  Which one?  ',
				image_path: null,
				tip: '   ',
				difficulty: 'low',
				options: [
					{ text: ' Root ', is_correct: true, tip: '', image_path: null, number: 1 },
					{ text: 'Leaf\n', is_correct: false, tip: ' Leaves make food. ' }
				]
			})
		).toStrictEqual({
			type: 'mcq',
			question: 'Which one?',
			options: [
				{ text: 'Root', is_correct: true },
				{ text: 'Leaf', is_correct: false, tip: 'Leaves make food.' }
			]
		});

		expect(
			stored({ type: 'numeric', question: 'How tall?', answer: 8, tolerance: null, unit: ' ' })
		).toStrictEqual({ type: 'numeric', question: 'How tall?', answer: 8 });
		expect(stored(broken('true_false', { labels: null, tip: null }))).toStrictEqual({
			type: 'true_false',
			question: complete.true_false.question,
			answer: true
		});
	});

	it('tidies lists of words: trimmed, without blanks or repeats', () => {
		expect(
			stored(broken('short_answer', { accepted_answers: [' chlorophyll ', '', 'chlorophyll'] }))
		).toHaveProperty('accepted_answers', ['chlorophyll']);
	});

	it('refuses what is not a question at all', () => {
		expect(refusedAt(null)).toEqual(['']);
		expect(refusedAt({ type: 'essay', question: 'Explain.' })).toEqual(['type']);
		expect(refusedAt({ type: 'numeric', form: 'percent', question: 'How much?' })).toEqual([
			'form'
		]);
		expect(messageAt({ type: 'essay' }, 'type')).toBe(m.item_invalid());
	});

	it('asks for the question on every type but a fill-in-the-blanks', () => {
		for (const [name, payload] of Object.entries(complete)) {
			if (payload.type === 'cloze') continue;
			expect(refusedAt({ ...payload, question: '  ' }), name).toEqual(['question']);
		}
		expect(messageAt(broken('mcq', { question: undefined }), 'question')).toBe(
			m.item_question_required()
		);
		expect(stored(broken('cloze', { question: ' ' }))).toStrictEqual(complete.cloze);
		expect(stored(broken('cloze', { question: ' Fill in. ' }))).toHaveProperty(
			'question',
			'Fill in.'
		);
	});

	it('reports everything wrong with a question at once', () => {
		expect(
			refusedAt({
				type: 'mcq',
				question: '',
				options: [
					{ text: 'Root', is_correct: false },
					{ text: '', is_correct: false },
					{ text: 'Root', is_correct: false }
				]
			})
		).toEqual(['question', 'options.1.text', 'options.2.text', 'options']);
	});

	describe('choices', () => {
		const options = (...correct: boolean[]) =>
			correct.map((is_correct, i) => ({ text: `Option ${i}`, is_correct }));

		it('asks for two options, each with words or a picture, no two alike', () => {
			expect(messageAt(broken('mcq', { options: options(true) }), 'options')).toBe(
				m.item_options_too_few()
			);
			const empty = [...options(true), { text: ' ', is_correct: false, image_path: null }];
			expect(messageAt(broken('mcq', { options: empty }), 'options', 1, 'text')).toBe(
				m.item_option_empty()
			);
			const twice = [...options(true, false), { text: ' Option 1', is_correct: false }];
			expect(messageAt(broken('mrq', { options: twice }), 'options', 2, 'text')).toBe(
				m.item_option_repeated()
			);
			// The same words under two pictures are two options a pupil can tell apart.
			const pictured = ['a.png', 'b.png', 'b.png'].map((image_path) => ({
				text: 'Leaf',
				is_correct: image_path === 'a.png',
				image_path
			}));
			expect(refusedAt(broken('mcq', { options: pictured }))).toEqual(['options.2.text']);
		});

		it('asks a multiple choice for exactly one right answer', () => {
			expect(messageAt(broken('mcq', { options: options(false, false) }), 'options')).toBe(
				m.item_mcq_one_correct()
			);
			expect(refusedAt(broken('mcq', { options: options(true, true, false) }))).toEqual([
				'options'
			]);
		});

		it('asks a multiple response for at least two right answers', () => {
			expect(messageAt(broken('mrq', { options: options(true, false, false) }), 'options')).toBe(
				m.item_mrq_two_correct()
			);
			expect(refusedAt(broken('mrq', { options: options(true, true, false) }))).toEqual([]);
		});

		it('refuses a multiple response where every option is right', () => {
			// Ticking everything would then be full marks.
			expect(messageAt(broken('mrq', { options: options(true, true, true) }), 'options')).toBe(
				m.item_mrq_all_correct()
			);
		});

		it('stores no tip on a right option, and none of its own for the two choice types', () => {
			const options = [
				{ text: 'Root', is_correct: true, tip: 'Written before it was marked right.' },
				{ text: 'Leaf', is_correct: false, tip: 'Leaves make food.' },
				{ text: 'Stem', is_correct: true }
			];
			for (const type of ['mcq', 'mrq'] as const) {
				const right = type === 'mcq' ? options.slice(0, 2) : options;
				const result = stored({
					type,
					question: 'Which?',
					tip: 'A tip of its own.',
					options: right
				});
				expect(result).not.toHaveProperty('tip');
				expect(result).toHaveProperty('options.0', { text: 'Root', is_correct: true });
				expect(result).toHaveProperty('options.1.tip', 'Leaves make food.');
			}
		});

		it('asks pick words for a sentence with at least one answer in it', () => {
			const word = { text: 'roots', is_correct: true };
			expect(messageAt(broken('pick_words', { options: [word] }), 'options')).toBe(
				m.item_sentence_too_short()
			);
			const none = complete.pick_words.options.map((each) => ({ ...each, is_correct: false }));
			expect(messageAt(broken('pick_words', { options: none }), 'options')).toBe(
				m.item_pick_words_none_correct()
			);
			// The same word twice in a sentence is fine.
			const other = { text: 'roots', is_correct: false };
			expect(refusedAt(broken('pick_words', { options: [word, other] }))).toEqual([]);
			// A sentence of nothing but answers is not.
			expect(messageAt(broken('pick_words', { options: [word, word] }), 'options')).toBe(
				m.item_pick_words_all_correct()
			);
		});
	});

	describe('true or false', () => {
		it('asks for an answer and for two different answer words', () => {
			expect(messageAt(broken('true_false', { answer: undefined }), 'answer')).toBe(
				m.item_true_false_answer_required()
			);
			expect(messageAt(broken('true_false', { labels: ['Ya', ' '] }), 'labels', 1)).toBe(
				m.item_true_false_words_required()
			);
			expect(messageAt(broken('true_false', { labels: ['Ya', 'Ya '] }), 'labels', 1)).toBe(
				m.item_true_false_words_same()
			);
		});
	});

	describe('tick table and classify', () => {
		const groups = (count: number) =>
			Array.from({ length: count }, (_, i) => ({ id: `g${i + 1}`, text: `Group ${i + 1}` }));

		it('asks a tick table for two to five named columns and a row', () => {
			expect(messageAt(broken('tick_table', { groups: groups(1) }), 'groups')).toBe(
				m.item_columns_count()
			);
			expect(refusedAt(broken('tick_table', { groups: groups(5) }))).toEqual([]);
			expect(refusedAt(broken('tick_table', { groups: groups(6) }))).toEqual(['groups']);
			expect(messageAt(broken('tick_table', { items: [] }), 'items')).toBe(m.item_rows_required());

			const unnamed = [{ id: 'g1', text: '' }, ...groups(3).slice(1)];
			expect(messageAt(broken('tick_table', { groups: unnamed }), 'groups', 0, 'text')).toBe(
				m.item_column_name_required()
			);
			const alike = [...groups(3), { id: 'g4', text: 'Group 1' }];
			expect(messageAt(broken('tick_table', { groups: alike }), 'groups', 3, 'text')).toBe(
				m.item_column_repeated()
			);
		});

		it('asks every row for its words and for a column that exists', () => {
			const rows = [
				{ id: 'r1', text: '', group_id: 'g1' },
				{ id: 'r2', text: 'Makes food', group_id: '' },
				{ id: 'r3', text: 'Makes food', group_id: 'gone' }
			];
			const payload = broken('tick_table', { items: rows });
			expect(messageAt(payload, 'items', 0, 'text')).toBe(m.item_row_text_required());
			expect(messageAt(payload, 'items', 1, 'group_id')).toBe(m.item_row_column_required());
			expect(messageAt(payload, 'items', 2, 'group_id')).toBe(m.item_row_column_required());
			expect(messageAt(payload, 'items', 2, 'text')).toBe(m.item_row_repeated());
		});

		it('asks classify for two to four groups and two items that are in one', () => {
			expect(messageAt(broken('classify', { groups: groups(5) }), 'groups')).toBe(
				m.item_groups_count()
			);
			const one = complete.classify.items.slice(0, 1);
			expect(messageAt(broken('classify', { items: one }), 'items')).toBe(
				m.item_classify_too_few()
			);

			const items = [
				{ id: 'i1', text: 'Hibiscus', group_id: 'g1' },
				{ id: 'i2', text: '', group_id: 'g2' },
				{ id: 'i3', text: 'Hibiscus', group_id: 'nowhere' }
			];
			const payload = broken('classify', { items });
			expect(messageAt(payload, 'items', 1, 'text')).toBe(m.item_entry_empty());
			expect(messageAt(payload, 'items', 2, 'text')).toBe(m.item_entry_repeated());
			expect(messageAt(payload, 'items', 2, 'group_id')).toBe(m.item_classify_group_required());
		});

		it('refuses two groups or two items with one id', () => {
			const groups = [
				{ id: 'g1', text: 'Flowering' },
				{ id: 'g1', text: 'Non-flowering' }
			];
			expect(refusedAt(broken('classify', { groups }))).toContain('groups.1.id');
			const items = complete.classify.items.map((item) => ({ ...item, id: 'same' }));
			expect(refusedAt(broken('classify', { items }))).toEqual(['items.1.id', 'items.2.id']);
		});
	});

	describe('fill in the blanks', () => {
		it('asks for a text with at least one blank', () => {
			expect(messageAt(broken('cloze', { text: ' ' }), 'text')).toBe(m.item_cloze_text_required());
			expect(messageAt({ type: 'cloze', text: 'No blank here.', blanks: [] }, 'blanks')).toBe(
				m.item_cloze_blanks_required()
			);
		});

		it('asks the text and the blanks to name the same blanks, each once', () => {
			const unanswered = broken('cloze', { text: 'The {{1}} and the {{2}} and the {{3}}.' });
			expect(messageAt(unanswered, 'text')).toBe(m.item_cloze_blank_unanswered({ n: 3 }));

			const unplaced = broken('cloze', { text: 'Only the {{1}}.' });
			expect(messageAt(unplaced, 'blanks', 1)).toBe(m.item_cloze_blank_unplaced({ n: 2 }));

			const twice = broken('cloze', { text: 'The {{1}}, the {{2}}, the {{1}}.' });
			expect(messageAt(twice, 'text')).toBe(m.item_cloze_blank_repeated({ n: 1 }));

			const sameIndex = [
				{ index: 1, accepted: ['roots'] },
				{ index: 1, accepted: ['stem'] }
			];
			expect(refusedAt(broken('cloze', { text: 'The {{1}}.', blanks: sameIndex }))).toEqual([
				'blanks.1.index'
			]);
		});

		it('asks every blank for an answer', () => {
			const blanks = [
				{ index: 1, accepted: ['roots'] },
				{ index: 2, accepted: [' '] }
			];
			expect(messageAt(broken('cloze', { blanks }), 'blanks', 1, 'accepted')).toBe(
				m.item_cloze_accepted_required()
			);
		});

		it('asks a choice at each blank for two to four choices with the answer among them', () => {
			const withChoices = (first: string[] | undefined) =>
				broken('cloze', {
					mode: 'choices',
					blanks: [
						{ index: 1, accepted: ['roots'], choices: first },
						{ index: 2, accepted: ['stem'], choices: ['stem', 'seed'] }
					]
				});
			expect(refusedAt(withChoices(['leaves', 'roots', 'flowers', 'seeds']))).toEqual([]);
			for (const choices of [
				undefined,
				['roots'],
				['roots', 'roots '],
				['a', 'b', 'c', 'd', 'e']
			]) {
				expect(messageAt(withChoices(choices), 'blanks', 0, 'choices')).toBe(
					m.item_cloze_choices_count()
				);
			}
			expect(messageAt(withChoices(['leaves', 'flowers']), 'blanks', 0, 'choices')).toBe(
				m.item_cloze_choices_answer()
			);
		});

		it('asks a word bank to allow a word twice when two blanks share an answer', () => {
			const blanks = [
				{ index: 1, accepted: ['the'] },
				{ index: 2, accepted: ['the'] }
			];
			const bank = broken('cloze', { mode: 'bank', blanks });
			expect(messageAt(bank, 'reuse')).toBe(m.item_cloze_reuse_required());
			expect(refusedAt({ ...bank, reuse: true })).toEqual([]);
			// Typed answers need no bank, so the same answer twice is fine there.
			expect(refusedAt(broken('cloze', { blanks }))).toEqual([]);
		});

		it('stores only the keys of the chosen way of answering', () => {
			const everything = {
				...complete.cloze,
				blanks: [
					{ index: 1, accepted: ['roots', 'root'], choices: ['roots', 'leaves'] },
					{ index: 2, accepted: ['stem'], choices: ['stem', 'seed'] }
				],
				distractors: ['flower', ' seed ', 'stem', ''],
				reuse: false
			};
			expect(stored(everything)).toStrictEqual(complete.cloze);
			// Typing is what a text with no mode is answered by, so it is stored as no mode.
			expect(stored({ ...everything, mode: 'typing' })).toStrictEqual(complete.cloze);
			// An extra word that is already an answer would be in the bank twice. A switch that
			// is off is a key that is not there.
			expect(stored({ ...everything, mode: 'bank' })).toStrictEqual({
				...complete.cloze,
				mode: 'bank',
				distractors: ['flower', 'seed']
			});
			expect(stored({ ...everything, mode: 'bank', reuse: true })).toHaveProperty('reuse', true);
			expect(stored({ ...everything, mode: 'bank', distractors: [] })).not.toHaveProperty(
				'distractors'
			);
			expect(stored({ ...everything, mode: 'choices' })).toStrictEqual({
				...complete.cloze,
				mode: 'choices',
				blanks: everything.blanks
			});
		});
	});

	describe('short answer and word completion', () => {
		it('asks a short answer for an accepted answer', () => {
			for (const accepted_answers of [[], ['  ']]) {
				expect(messageAt(broken('short_answer', { accepted_answers }), 'accepted_answers')).toBe(
					m.item_short_answer_required()
				);
			}
		});

		it('asks a word completion for one word of 2 to 30 characters', () => {
			for (const answer of ['', 'a', 'green leaf', 'x'.repeat(31), undefined]) {
				expect(messageAt(broken('word_completion', { answer }), 'answer')).toBe(
					m.item_word_invalid()
				);
			}
			for (const answer of ['ox', ' leaf ', 'x'.repeat(30), 'chlorophyll']) {
				expect(refusedAt(broken('word_completion', { answer }))).toEqual([]);
			}
		});
	});

	describe('number', () => {
		it('asks for a number, however an empty box arrives', () => {
			for (const answer of [null, undefined, NaN, '8.1', Infinity]) {
				expect(messageAt(broken('number', { answer }), 'answer')).toBe(m.item_number_required());
				expect(messageAt(broken('money', { answer }), 'answer')).toBe(m.item_number_required());
			}
			expect(refusedAt(broken('number', { answer: -2.5, tolerance: 0 }))).toEqual([]);
		});

		it('stores a number with the form written out as one without', () => {
			expect(stored({ ...complete.number, form: 'number' })).toStrictEqual(complete.number);
		});

		it('stores a switch that is off as no key at all', () => {
			expect(stored({ ...complete.fraction, equivalent: false })).not.toHaveProperty('equivalent');
			expect(stored({ ...complete.mixed, improper: false })).not.toHaveProperty('improper');
			expect(stored({ ...complete.word_completion, reveal_first: false })).not.toHaveProperty(
				'reveal_first'
			);
			expect(stored({ ...complete.fraction, equivalent: true })).toHaveProperty('equivalent', true);
		});

		it('refuses a tolerance below zero', () => {
			expect(messageAt(broken('number', { tolerance: -0.1 }), 'tolerance')).toBe(
				m.item_tolerance_invalid()
			);
		});

		it('keeps only the keys of the form', () => {
			expect(stored({ ...complete.money, tolerance: 1, unit: 'RM', parts: [1, 2] })).toStrictEqual(
				complete.money
			);
			expect(stored({ ...complete.fraction, answer: 0.75, unit: 'cm' })).toStrictEqual(
				complete.fraction
			);
		});

		it('asks every part for a whole number, and a denominator for one or more', () => {
			for (const part of [null, NaN, 1.5, -1, '3']) {
				expect(messageAt(broken('fraction', { parts: [part, 4] }), 'parts', 0)).toBe(
					m.item_whole_number_required()
				);
				expect(messageAt(broken('measure', { parts: [2, part] }), 'parts', 1)).toBe(
					m.item_whole_number_required()
				);
			}
			expect(messageAt(broken('fraction', { parts: [3, 0] }), 'parts', 1)).toBe(
				m.item_denominator_invalid()
			);
			expect(messageAt(broken('mixed', { parts: [2, 1, 0] }), 'parts', 2)).toBe(
				m.item_denominator_invalid()
			);
			expect(refusedAt(broken('mixed', { parts: [0, 0, 1] }))).toEqual([]);
			expect(refusedAt(broken('fraction', { parts: [3] }))).toEqual(['parts']);
			expect(refusedAt(broken('mixed', { parts: [2, 1] }))).toEqual(['parts']);
		});

		it('asks a ratio for two or three terms', () => {
			expect(refusedAt(broken('ratio', { parts: [5, 7] }))).toEqual([]);
			for (const parts of [[5], [1, 2, 3, 4]]) {
				expect(messageAt(broken('ratio', { parts }), 'parts')).toBe(m.item_ratio_terms());
			}
			expect(refusedAt(broken('ratio', { parts: [5, 0.5] }))).toEqual(['parts.1']);
		});

		it('reads the hour by the clock the time is on', () => {
			const time = (hour: number, minute: number, period: string | null) =>
				broken('time', { parts: [hour, minute], period });
			for (const ok of [
				time(12, 0, 'am'),
				time(1, 59, 'pm'),
				time(0, 0, null),
				time(23, 59, null)
			]) {
				expect(refusedAt(ok)).toEqual([]);
			}
			expect(messageAt(time(5, 60, 'pm'), 'parts', 1)).toBe(m.item_minutes_invalid());
			expect(messageAt(time(0, 30, 'am'), 'parts', 0)).toBe(m.item_hour_12_invalid());
			expect(messageAt(time(17, 50, 'pm'), 'parts', 0)).toBe(m.item_hour_12_invalid());
			expect(messageAt(time(24, 0, null), 'parts', 0)).toBe(m.item_hour_24_invalid());
			expect(refusedAt(time(5, 50, 'evening'))).toEqual(['period']);
			expect(refusedAt(broken('time', { period: undefined }))).toEqual(['period']);
		});

		it('asks a measure for both of its units', () => {
			expect(messageAt(broken('measure', { units: ['kg', ' '] }), 'units', 1)).toBe(
				m.item_units_required()
			);
			expect(stored(broken('measure', { units: [' kg ', 'g'] }))).toHaveProperty('units', [
				'kg',
				'g'
			]);
		});
	});

	describe('matching', () => {
		it('asks for a pair, and for words or a picture on both sides', () => {
			const nothing = broken('matching', { left: [], right: [], pairs: [] });
			expect(messageAt(nothing, 'left')).toBe(m.item_pairs_required());
			expect(messageAt(nothing, 'right')).toBe(m.item_pairs_required());

			const right = [{ id: 'r1', text: ' ' }, ...complete.matching.right.slice(1)];
			expect(messageAt(broken('matching', { right }), 'right', 0, 'text')).toBe(
				m.item_answer_empty()
			);
		});

		it('refuses two items on one side that read the same', () => {
			const right = [...complete.matching.right, { id: 'r4', text: 'Make food' }];
			expect(messageAt(broken('matching', { right }), 'right', 3, 'text')).toBe(
				m.item_answer_repeated()
			);
		});

		it('asks every left item for one answer that exists', () => {
			const [first, second, third] = complete.matching.pairs;
			const unpaired = broken('matching', { pairs: [first, second] });
			expect(messageAt(unpaired, 'left', 2)).toBe(m.item_pair_required());

			const nowhere = broken('matching', {
				pairs: [first, second, { left_id: 'l3', right_id: '' }]
			});
			expect(refusedAt(nowhere)).toEqual(['left.2']);

			const twice = broken('matching', { pairs: [first, second, third, { ...third }] });
			expect(refusedAt(twice)).toEqual(['pairs.3.left_id']);

			const stray = broken('matching', {
				pairs: [first, second, third, { left_id: 'gone', right_id: 'r1' }]
			});
			expect(refusedAt(stray)).toEqual(['pairs.3.left_id']);
		});
	});

	describe('ordering and sentence rearrangement', () => {
		it('asks for two items, and an order that names each once', () => {
			const one = broken('ordering', { items: [{ id: 'a', text: 'Seed' }], correct_order: ['a'] });
			expect(messageAt(one, 'items')).toBe(m.item_ordering_too_few());
			const chip = broken('rearrange', { items: [{ id: 'a', text: 'Go' }], correct_order: ['a'] });
			expect(messageAt(chip, 'items')).toBe(m.item_sentence_too_short());

			for (const correct_order of [
				['a', 'b'],
				['a', 'b', 'b'],
				['a', 'b', 'z'],
				['a', 'b', 'c', 'a']
			]) {
				expect(refusedAt(broken('ordering', { correct_order }))).toEqual(['correct_order']);
			}
			expect(refusedAt(broken('rearrange', { correct_order: [] }))).toEqual(['correct_order']);
		});

		it('refuses two ordering items alike, but lets a sentence repeat a word', () => {
			const items = [
				{ id: 'a', text: 'Seed' },
				{ id: 'b', text: 'Seed' },
				{ id: 'c', text: ' ' }
			];
			const payload = broken('ordering', { items });
			expect(messageAt(payload, 'items', 1, 'text')).toBe(m.item_entry_repeated());
			expect(messageAt(payload, 'items', 2, 'text')).toBe(m.item_entry_empty());
			expect(refusedAt(complete.rearrange)).toEqual([]);
		});

		it('keeps a chip to its words: a picture on one is dropped', () => {
			const items = complete.rearrange.items.map((chip) => ({ ...chip, image_path: 'x.png' }));
			expect(stored(broken('rearrange', { items }))).toStrictEqual(complete.rearrange);
		});
	});

	describe('label a picture', () => {
		it('asks for the picture and for a named label on it', () => {
			for (const image_path of [undefined, null, ' ']) {
				expect(messageAt(broken('label_picture', { image_path }), 'image_path')).toBe(
					m.item_picture_required()
				);
			}
			expect(messageAt(broken('label_picture', { labels: [] }), 'labels')).toBe(
				m.item_labels_required()
			);
			const labels = [{ id: 'a', text: '', x: 10, y: 10 }];
			expect(messageAt(broken('label_picture', { labels }), 'labels', 0, 'text')).toBe(
				m.item_label_text_required()
			);
		});

		it('keeps a label inside the picture', () => {
			const at = (x: unknown, y: unknown) =>
				broken('label_picture', { labels: [{ id: 'a', text: 'Leaf', x, y }] });
			expect(refusedAt(at(0, 100))).toEqual([]);
			expect(refusedAt(at(-1, 50))).toEqual(['labels.0.x']);
			expect(refusedAt(at(50, 100.5))).toEqual(['labels.0.y']);
			expect(refusedAt(at(50, null))).toEqual(['labels.0.y']);
		});

		it('asks how pupils answer, and keeps extra words only for a word bank', () => {
			expect(refusedAt(broken('label_picture', { mode: 'choices' }))).toEqual(['mode']);
			expect(stored(broken('label_picture', { mode: 'typing' }))).not.toHaveProperty('distractors');
			expect(
				stored(broken('label_picture', { distractors: [' Seed', 'Leaf', 'Seed'] }))
			).toHaveProperty('distractors', ['Seed']);
		});
	});
});

describe('what the database cannot store', () => {
	const NUL = String.fromCharCode(0);
	const LONE = String.fromCharCode(0xd83d);

	it('tells a text the database can store from one it cannot', () => {
		expect(storable('Akar menyerap air. 根吸收水分。 🌱')).toBe(true);
		expect(storable(`a${NUL}b`)).toBe(false);
		// Half of a surrogate pair on its own; a whole pair is a character like any other.
		expect(storable(`a${LONE}`)).toBe(false);
	});

	it('refuses such a character at the field it is in, in words', () => {
		for (const bad of [NUL, LONE]) {
			expect(messageAt(broken('mcq', { question: `Which${bad}?` }), 'question')).toBe(
				m.item_text_unstorable()
			);
			const options = [{ text: `Root${bad}`, is_correct: true }, complete.mcq.options[0]];
			expect(messageAt(broken('mcq', { options }), 'options', 0, 'text')).toBe(
				m.item_text_unstorable()
			);
			// A word of a list is refused at the list, which is where a form shows it.
			expect(
				messageAt(broken('short_answer', { accepted_answers: [`ok${bad}`] }), 'accepted_answers')
			).toBe(m.item_text_unstorable());
			expect(messageAt(broken('true_false', { tip: `Think${bad}` }), 'tip')).toBe(
				m.item_text_unstorable()
			);
		}
	});

	it('refuses a word to spell that holds a space or a control character of any kind', () => {
		// U+0085 and U+001C to U+001F are spaces to the database's own check of a word.
		for (const code of [0x20, 0x09, 0x85, 0x1c, 0x1f, 0x3000, 0x00]) {
			const answer = `le${String.fromCharCode(code)}af`;
			expect(messageAt(broken('word_completion', { answer }), 'answer')).toBe(
				m.item_word_invalid()
			);
		}
		expect(refusedAt(broken('word_completion', { answer: '叶子' }))).toEqual([]);
	});
});

describe('how much a question may hold', () => {
	const long = (length: number) => 'x'.repeat(length);

	it('counts a length in characters as a person counts them', () => {
		expect(chars('叶子')).toBe(2);
		expect(chars('🌱🌱')).toBe(2);
	});

	it.each([
		[
			'question',
			MAX_QUESTION_CHARS,
			(text: string) => broken('mcq', { question: text }),
			['question']
		],
		['tip', MAX_TIP_CHARS, (text: string) => broken('true_false', { tip: text }), ['tip']],
		[
			'option',
			MAX_ENTRY_CHARS,
			(text: string) =>
				broken('mcq', { options: [{ text, is_correct: true }, complete.mcq.options[0]] }),
			['options', 0, 'text']
		],
		[
			'tip of an option',
			MAX_TIP_CHARS,
			(text: string) =>
				broken('mcq', {
					options: [complete.mcq.options[1], { text: 'Leaf', is_correct: false, tip: text }]
				}),
			['options', 1, 'tip']
		],
		['unit', MAX_UNIT_CHARS, (text: string) => broken('number', { unit: text }), ['unit']],
		[
			'text of a fill in the blanks',
			MAX_QUESTION_CHARS,
			// The two blanks and the words between them are the first sixteen characters.
			(text: string) =>
				broken('cloze', { text: `{{1}} and {{2}} ${Array.from(text).slice(16).join('')}` }),
			['text']
		]
	] as const)('takes a %s of up to %i characters and refuses one more', (_, max, make, path) => {
		expect(refusedAt(make(long(max)))).toEqual([]);
		expect(messageAt(make(long(max + 1)), ...path)).toBe(m.item_text_too_long({ max }));
		// An emoji is one character, though it is two of what JavaScript counts.
		expect(refusedAt(make('🌱'.repeat(max)))).toEqual([]);
	});

	it('refuses a word of a list that is too long, at the list', () => {
		const accepted_answers = ['ok', long(MAX_ENTRY_CHARS + 1)];
		expect(messageAt(broken('short_answer', { accepted_answers }), 'accepted_answers')).toBe(
			m.item_text_too_long({ max: MAX_ENTRY_CHARS })
		);
	});

	it('refuses a list with more entries than a list holds', () => {
		const words = (count: number) => Array.from({ length: count }, (_, at) => `word ${at}`);
		expect(refusedAt(broken('short_answer', { accepted_answers: words(MAX_ENTRIES) }))).toEqual([]);
		expect(
			messageAt(
				broken('short_answer', { accepted_answers: words(MAX_ENTRIES + 1) }),
				'accepted_answers'
			)
		).toBe(m.item_list_too_long({ max: MAX_ENTRIES }));

		const options = (count: number) =>
			words(count).map((text, at) => ({ text, is_correct: at === 0 }));
		expect(refusedAt(broken('mcq', { options: options(MAX_ENTRIES) }))).toEqual([]);
		expect(messageAt(broken('mcq', { options: options(MAX_ENTRIES + 1) }), 'options')).toBe(
			m.item_list_too_long({ max: MAX_ENTRIES })
		);

		// A sentence is cut into more pieces than a list a person fills in by hand.
		expect(refusedAt(broken('pick_words', { options: options(MAX_WORDS) }))).toEqual([]);
		expect(messageAt(broken('pick_words', { options: options(MAX_WORDS + 1) }), 'options')).toBe(
			m.item_list_too_long({ max: MAX_WORDS })
		);
	});

	it('refuses an id longer than the editor makes them, as a question it cannot read', () => {
		const groups = [{ id: long(MAX_ID_CHARS + 1), text: 'Roots' }, ...complete.tick_table.groups];
		expect(messageAt(broken('tick_table', { groups }), 'groups', 0, 'id')).toBe(m.item_invalid());
	});
});

describe('issueAt', () => {
	const issues = [
		{ path: ['options'], message: 'the list' },
		{ path: ['options', 1, 'text'], message: 'the second option' },
		{ path: ['options', 1, 'text'], message: 'the second option, again' }
	];

	it('finds the first refusal at exactly that key', () => {
		expect(issueAt(issues, 'options')).toBe('the list');
		expect(issueAt(issues, 'options', 1, 'text')).toBe('the second option');
	});

	it('finds nothing at a key with no refusal of its own', () => {
		expect(issueAt(issues, 'options', 1)).toBeUndefined();
		expect(issueAt(issues, 'question')).toBeUndefined();
	});
});
