import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import { ITEM_TYPES, type ItemPayload, type ItemType } from './payload.js';
import { validateItem } from './schema.js';
import {
	PASSAGE_SHEET,
	QUESTION_SHEETS,
	readPassageRow,
	readQuestionRow,
	readRows,
	SHEETS,
	type Cells,
	type SheetRow
} from './sheets.js';

type SheetType = Exclude<ItemType, 'label_picture'>;

const sheetOf = (type: SheetType) => {
	const sheet = QUESTION_SHEETS.find((each) => each.type === type);
	if (!sheet) throw new Error(`No sheet for ${type}`);
	return sheet;
};

/** A row of the type's sheet: its example, with the cells given written over it. */
const row = (type: SheetType, cells: Cells = {}): Cells => ({ ...sheetOf(type).sample, ...cells });

function payloadOf<Type extends SheetType>(type: Type, cells: Cells = {}) {
	const read = readQuestionRow(sheetOf(type), row(type, cells));
	if (!read.ok) throw new Error(`${read.problem.column}: ${read.problem.message}`);
	return read.question.payload as Extract<ItemPayload, { type: Type }>;
}

function problemOf(type: SheetType, cells: Cells) {
	const read = readQuestionRow(sheetOf(type), row(type, cells));
	if (read.ok) throw new Error('The row was read');
	return read.problem;
}

describe('the sheets', () => {
	it('are one a type in the builder’s order, without Label a Picture, and the passages', () => {
		expect(QUESTION_SHEETS.map((sheet) => sheet.type)).toEqual(
			ITEM_TYPES.filter((type) => type !== 'label_picture')
		);
		expect(SHEETS.at(-1)).toBe(PASSAGE_SHEET);
	});

	it('have names a spreadsheet takes, each its own', () => {
		const names = SHEETS.map((sheet) => sheet.name);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) expect(name.length).toBeLessThanOrEqual(31);
	});

	it('end every question sheet with Difficulty, Tip and Passage', () => {
		for (const sheet of QUESTION_SHEETS) {
			expect(sheet.columns.slice(-3).map((column) => column.header)).toEqual([
				'Difficulty',
				'Tip',
				'Passage'
			]);
		}
	});

	it('give each column of a sheet its own key and header, and an example that fits them', () => {
		for (const sheet of SHEETS) {
			const keys = sheet.columns.map((column) => column.key);
			const headers = sheet.columns.map((column) => column.header);
			expect(new Set(keys).size).toBe(keys.length);
			expect(new Set(headers).size).toBe(headers.length);
			for (const key of Object.keys(sheet.sample)) expect(keys).toContain(key);
			expect(sheet.notes.length).toBeGreaterThan(0);
		}
	});

	it.each(QUESTION_SHEETS.map((sheet) => [sheet.name, sheet] as const))(
		'read the example of %s as a complete question',
		(_, sheet) => {
			const read = readQuestionRow(sheet, sheet.sample);
			expect(read).toMatchObject({ ok: true, question: { payload: { type: sheet.type } } });
			if (read.ok) expect(validateItem(read.question.payload)).toMatchObject({ ok: true });
		}
	);

	it('read the example of Passages as a passage', () => {
		expect(readPassageRow(PASSAGE_SHEET.sample)).toEqual({
			ok: true,
			passage: {
				code: 'p1',
				title: 'The Water Cycle',
				body: PASSAGE_SHEET.sample.text
			}
		});
	});
});

describe('what every question row has', () => {
	it('is of medium difficulty unless it says otherwise, in any capitals', () => {
		const read = (difficulty: string) =>
			readQuestionRow(sheetOf('short_answer'), row('short_answer', { difficulty }));
		expect(read('')).toMatchObject({ question: { difficulty: 'medium' } });
		expect(read('HIGH')).toMatchObject({ question: { difficulty: 'high' } });
		expect(read('low')).toMatchObject({ question: { difficulty: 'low' } });
		expect(problemOf('short_answer', { difficulty: 'Hard' })).toEqual({
			column: 'Difficulty',
			message: m.practice_import_difficulty()
		});
	});

	it('carries its tip and the code of its passage', () => {
		const read = readQuestionRow(
			sheetOf('short_answer'),
			row('short_answer', { tip: 'Think of the air.', passage: ' P1 ' })
		);
		expect(read).toMatchObject({
			question: { passage: 'p1', payload: { tip: 'Think of the air.' } }
		});
		expect(payloadOf('short_answer')).not.toHaveProperty('tip');
	});

	it('says a missing question in the words of the builder, at its column', () => {
		expect(problemOf('short_answer', { question: '' })).toEqual({
			column: 'Question',
			message: m.item_question_required()
		});
		expect(problemOf('true_false', { question: '' }).column).toBe('Statement');
	});

	it('does not mind a column that is gone', () => {
		const { question, answers } = row('short_answer');
		expect(readQuestionRow(sheetOf('short_answer'), { question, answers })).toMatchObject({
			ok: true,
			question: { difficulty: 'medium', passage: null }
		});
	});
});

describe('Multiple Choice and Multiple Response', () => {
	it('marks the option under the answer’s letter', () => {
		expect(payloadOf('mcq', { answer: 'c', tip: '' }).options).toEqual([
			{ text: 'Roots', is_correct: false },
			{ text: 'Stem', is_correct: false },
			{ text: 'Leaf', is_correct: true },
			{ text: 'Flower', is_correct: false }
		]);
	});

	it('keeps an option’s letter when a column before it is empty', () => {
		const payload = payloadOf('mcq', { option_B: '', answer: 'D', tip: '' });
		expect(payload.options.map((option) => [option.text, option.is_correct])).toEqual([
			['Roots', false],
			['Leaf', false],
			['Flower', true]
		]);
	});

	it('puts the tip on the wrong options, where these two types keep it', () => {
		const payload = payloadOf('mcq', { tip: 'Under the ground.' });
		expect(payload).not.toHaveProperty('tip');
		expect(payload.options.map((option) => option.tip)).toEqual([
			undefined,
			'Under the ground.',
			'Under the ground.',
			'Under the ground.'
		]);
	});

	it('takes several letters for a Multiple Response, however they are set apart', () => {
		for (const answer of ['A, C, D', 'a c d', 'A|C|D', 'A,C & D']) {
			expect(payloadOf('mrq', { answer }).options.map((option) => option.is_correct)).toEqual([
				true,
				false,
				true,
				true
			]);
		}
	});

	it('names the Answer column when the letter is no option', () => {
		const letter = { column: 'Answer', message: m.practice_import_answer_letter() };
		expect(problemOf('mcq', { answer: 'E' })).toEqual(letter);
		expect(problemOf('mcq', { answer: 'Roots' })).toEqual(letter);
		expect(problemOf('mcq', { answer: 'A, B' })).toEqual(letter);
		expect(problemOf('mcq', { answer: '' })).toEqual({
			column: 'Answer',
			message: m.item_mcq_one_correct()
		});
		expect(problemOf('mrq', { answer: 'A' })).toEqual({
			column: 'Answers',
			message: m.item_mrq_two_correct()
		});
		expect(problemOf('mrq', { answer: 'A, G' })).toEqual({
			column: 'Answers',
			message: m.practice_import_answer_letters()
		});
	});

	it('names the option that repeats another, and no column for too few options', () => {
		expect(problemOf('mcq', { option_C: 'Roots' })).toEqual({
			column: 'Option C',
			message: m.item_option_repeated()
		});
		expect(problemOf('mcq', { option_B: '', option_C: '', option_D: '', answer: 'A' })).toEqual({
			column: null,
			message: m.item_options_too_few()
		});
	});
});

describe('True or False', () => {
	it('reads True and False, and leaves the words to the runner', () => {
		expect(payloadOf('true_false', { answer: 'true' })).toMatchObject({ answer: true });
		expect(payloadOf('true_false', { answer: 'False' })).toMatchObject({ answer: false });
		expect(payloadOf('true_false', { answer: 'True' })).not.toHaveProperty('labels');
		// What a cell holds once Excel has made a boolean of it.
		expect(payloadOf('true_false', { answer: 'FALSE' })).toMatchObject({ answer: false });
	});

	it('takes the answer in the words of the question, and shows pupils those words', () => {
		expect(payloadOf('true_false', { answer: 'Salah' })).toMatchObject({
			answer: false,
			labels: ['Betul', 'Salah']
		});
		expect(payloadOf('true_false', { answer: '对' })).toMatchObject({
			answer: true,
			labels: ['对', '错']
		});
	});

	it('names the Answer column for anything else', () => {
		const expected = { column: 'Answer', message: m.practice_import_true_false() };
		expect(problemOf('true_false', { answer: '' })).toEqual(expected);
		expect(problemOf('true_false', { answer: 'Maybe' })).toEqual(expected);
	});
});

describe('Tick Table', () => {
	it('makes the columns and ticks each row under the one it names', () => {
		const payload = payloadOf('tick_table');
		expect(payload.groups.map((group) => group.text)).toEqual(['Living', 'Non-living']);
		const column = (id: string) => payload.groups.find((group) => group.id === id)?.text;
		expect(payload.items.map((item) => [item.text, column(item.group_id)])).toEqual([
			['Cat', 'Living'],
			['Rock', 'Non-living'],
			['Tree', 'Living']
		]);
	});

	it('names the Tick that is not a column, and the one left empty', () => {
		expect(problemOf('tick_table', { tick_2: 'Dead' })).toEqual({
			column: 'Tick 2',
			message: m.practice_import_not_a_column({ value: 'Dead' })
		});
		expect(problemOf('tick_table', { tick_3: '' })).toEqual({
			column: 'Tick 3',
			message: m.item_row_column_required()
		});
		expect(problemOf('tick_table', { row_1: '' })).toEqual({
			column: 'Row 1',
			message: m.item_row_text_required()
		});
		expect(problemOf('tick_table', { columns: 'Living', tick_2: 'Living' })).toEqual({
			column: 'Columns',
			message: m.item_columns_count()
		});
	});
});

describe('Pick Words', () => {
	it('cuts the sentence at its spaces and marks the words in brackets', () => {
		expect(payloadOf('pick_words').options).toEqual([
			{ text: 'The', is_correct: false },
			{ text: 'cat', is_correct: true },
			{ text: 'sat', is_correct: false },
			{ text: 'on', is_correct: false },
			{ text: 'the', is_correct: false },
			{ text: 'mat.', is_correct: true }
		]);
	});

	it('marks every word of a bracket that holds several', () => {
		const payload = payloadOf('pick_words', { sentence: 'We flew to [Kuala Lumpur] today.' });
		expect(payload.options.filter((word) => word.is_correct).map((word) => word.text)).toEqual([
			'Kuala',
			'Lumpur'
		]);
	});

	it('reads a Chinese sentence written with spaces between its words', () => {
		const payload = payloadOf('pick_words', { sentence: '小猫 在 [花园] 里 [玩耍]。' });
		expect(payload.options.map((word) => [word.text, word.is_correct])).toEqual([
			['小猫', false],
			['在', false],
			['花园', true],
			['里', false],
			['玩耍。', true]
		]);
	});

	it('names the Sentence column when no word is in brackets', () => {
		expect(problemOf('pick_words', { sentence: 'The cat sat on the mat.' })).toEqual({
			column: 'Sentence',
			message: m.practice_import_pick_words_brackets()
		});
		expect(problemOf('pick_words', { sentence: '' })).toEqual({
			column: 'Sentence',
			message: m.item_sentence_too_short()
		});
	});
});

describe('Fill in the Blanks', () => {
	it('types by default, accepting every spelling in the bracket', () => {
		const payload = payloadOf('cloze', {
			text: 'The [colour|color] of a leaf is [green].',
			mode: '',
			extra: ''
		});
		expect(payload).toMatchObject({
			text: 'The {{1}} of a leaf is {{2}}.',
			blanks: [
				{ index: 1, accepted: ['colour', 'color'] },
				{ index: 2, accepted: ['green'] }
			]
		});
		expect(payload).not.toHaveProperty('mode');
	});

	it('makes a word bank of the answers and the extra words', () => {
		expect(payloadOf('cloze')).toMatchObject({
			mode: 'bank',
			distractors: ['stem', 'flower'],
			blanks: [
				{ index: 1, accepted: ['roots'] },
				{ index: 2, accepted: ['leaves'] }
			]
		});
		expect(payloadOf('cloze')).not.toHaveProperty('reuse');
	});

	it('lets a bank word be used twice when two blanks share it', () => {
		const payload = payloadOf('cloze', { text: '[Water] is wet. [Water] is clear.', extra: '' });
		expect(payload).toMatchObject({ mode: 'bank', reuse: true });
	});

	it('takes the first word of a bracket as the answer among the choices', () => {
		const payload = payloadOf('cloze', {
			text: 'The [roots|leaves|stem] take in water.',
			mode: 'choices',
			extra: ''
		});
		expect(payload).toMatchObject({
			mode: 'choices',
			blanks: [{ index: 1, accepted: ['roots'], choices: ['roots', 'leaves', 'stem'] }]
		});
	});

	it('needs no question, and reads Chinese', () => {
		const payload = payloadOf('cloze', {
			question: '',
			text: '植物用[根]吸收水分，用[叶子|叶]制造养分。',
			mode: 'Typing',
			extra: ''
		});
		expect(payload).not.toHaveProperty('question');
		expect(payload).toMatchObject({
			text: '植物用{{1}}吸收水分，用{{2}}制造养分。',
			blanks: [
				{ index: 1, accepted: ['根'] },
				{ index: 2, accepted: ['叶子', '叶'] }
			]
		});
	});

	it('names the column of each mistake', () => {
		expect(problemOf('cloze', { text: 'The roots take in water.' })).toEqual({
			column: 'Text',
			message: m.item_cloze_blanks_required()
		});
		expect(problemOf('cloze', { text: 'The [] take in water.' })).toEqual({
			column: 'Text',
			message: m.item_cloze_accepted_required()
		});
		expect(problemOf('cloze', { mode: 'Bank' })).toEqual({
			column: 'Answer Mode',
			message: m.practice_import_cloze_mode()
		});
		expect(problemOf('cloze', { mode: 'Typing' })).toEqual({
			column: 'Extra Words',
			message: m.practice_import_cloze_extra()
		});
		expect(problemOf('cloze', { mode: 'Choices', extra: '' })).toEqual({
			column: 'Text',
			message: m.item_cloze_choices_count()
		});
	});
});

describe('Short Answer and Word Completion', () => {
	it('accepts every answer between the bars', () => {
		expect(payloadOf('short_answer').accepted_answers).toEqual(['carbon dioxide', 'CO2']);
		expect(payloadOf('short_answer', { answers: '二氧化碳 | CO2 |' }).accepted_answers).toEqual([
			'二氧化碳',
			'CO2'
		]);
		expect(problemOf('short_answer', { answers: ' | ' })).toEqual({
			column: 'Accepted Answers',
			message: m.item_short_answer_required()
		});
	});

	it('reads the word and whether its first letter shows', () => {
		expect(payloadOf('word_completion')).toMatchObject({ answer: 'leaf', reveal_first: true });
		expect(payloadOf('word_completion', { reveal: 'no' })).not.toHaveProperty('reveal_first');
		expect(payloadOf('word_completion', { reveal: '' })).not.toHaveProperty('reveal_first');
		expect(problemOf('word_completion', { word: 'green leaf' })).toEqual({
			column: 'Word',
			message: m.item_word_invalid()
		});
		expect(problemOf('word_completion', { reveal: 'maybe' })).toEqual({
			column: 'Show First Letter',
			message: m.practice_import_yes_no()
		});
	});
});

describe('Number', () => {
	const plain = { form: '', equal: '' };

	it('reads a plain number with its unit and tolerance', () => {
		expect(
			payloadOf('numeric', { ...plain, answer: '12.5', unit: 'cm', tolerance: '0.1' })
		).toEqual({
			type: 'numeric',
			question: 'What fraction of the pizza is left?',
			answer: 12.5,
			unit: 'cm',
			tolerance: 0.1
		});
		expect(payloadOf('numeric', { ...plain, answer: '1,500' })).toMatchObject({ answer: 1500 });
		expect(payloadOf('numeric', { ...plain, answer: '-3' })).toMatchObject({ answer: -3 });
	});

	it('reads each answer form as it is written', () => {
		expect(payloadOf('numeric')).toMatchObject({
			form: 'fraction',
			parts: [3, 4],
			equivalent: true
		});
		expect(
			payloadOf('numeric', { form: 'Mixed Number', answer: '2 1/2', unit: 'm', equal: 'yes' })
		).toMatchObject({ form: 'mixed', parts: [2, 1, 2], unit: 'm', improper: true });
		expect(payloadOf('numeric', { form: 'ratio', answer: '1 : 2 : 3', equal: '' })).toMatchObject({
			form: 'ratio',
			parts: [1, 2, 3]
		});
		expect(payloadOf('numeric', { form: 'Money', answer: 'RM 1,019.20', equal: '' })).toMatchObject(
			{ form: 'money', answer: 1019.2 }
		);
		expect(
			payloadOf('numeric', { form: 'Measure', answer: '2 kg 500 g', equal: '' })
		).toMatchObject({ form: 'measure', parts: [2, 500], units: ['kg', 'g'] });
		expect(
			payloadOf('numeric', { form: 'Measure in Two Units', answer: '1ℓ 250mℓ', equal: '' })
		).toMatchObject({ parts: [1, 250], units: ['ℓ', 'mℓ'] });
	});

	it('reads a time on either clock', () => {
		const time = (answer: string) => payloadOf('numeric', { form: 'Time', answer, equal: '' });
		expect(time('7:30 am')).toMatchObject({ form: 'time', parts: [7, 30], period: 'am' });
		expect(time('5.50 p.m.')).toMatchObject({ parts: [5, 50], period: 'pm' });
		expect(time('17:50')).toMatchObject({ parts: [17, 50], period: null });
	});

	it('says what an answer is not, at the Answer column', () => {
		const at = (form: string, answer: string) => problemOf('numeric', { form, answer, equal: '' });
		expect(at('', 'twelve')).toEqual({
			column: 'Answer',
			message: m.practice_import_not_number({ value: 'twelve' })
		});
		expect(at('Fraction', '0.75')).toEqual({
			column: 'Answer',
			message: m.practice_import_not_fraction({ value: '0.75' })
		});
		expect(at('Mixed', '5/2').message).toBe(m.practice_import_not_mixed({ value: '5/2' }));
		expect(at('Ratio', '3 to 4').message).toBe(m.practice_import_not_ratio({ value: '3 to 4' }));
		expect(at('Time', 'half past seven').message).toBe(
			m.practice_import_not_time({ value: 'half past seven' })
		);
		expect(at('Measure', '2.5 kg').message).toBe(
			m.practice_import_not_measure({ value: '2.5 kg' })
		);
		expect(at('Fraction', '')).toEqual({
			column: 'Answer',
			message: m.practice_import_cell_empty()
		});
	});

	it('leaves the rules of each form to the builder’s own', () => {
		expect(problemOf('numeric', { answer: '3/0' })).toEqual({
			column: 'Answer',
			message: m.item_denominator_invalid()
		});
		expect(problemOf('numeric', { form: 'Time', answer: '13:30 pm', equal: '' })).toEqual({
			column: 'Answer',
			message: m.item_hour_12_invalid()
		});
		expect(problemOf('numeric', { ...plain, answer: '5', tolerance: '-1' })).toEqual({
			column: 'Tolerance',
			message: m.item_tolerance_invalid()
		});
	});

	it('names the column of a form that is none, and of a cell its form does not use', () => {
		expect(problemOf('numeric', { form: 'Decimal' })).toEqual({
			column: 'Answer Form',
			message: m.practice_import_numeric_form()
		});
		expect(problemOf('numeric', { unit: 'cm' })).toEqual({
			column: 'Unit',
			message: m.practice_import_numeric_unused({ form: 'Fraction' })
		});
		expect(problemOf('numeric', { ...plain, answer: '5', equal: 'Yes' })).toEqual({
			column: 'Accept Equal Answers',
			message: m.practice_import_numeric_unused({ form: 'Number' })
		});
		expect(problemOf('numeric', { ...plain, answer: '5', tolerance: 'a bit' })).toEqual({
			column: 'Tolerance',
			message: m.practice_import_not_number({ value: 'a bit' })
		});
	});
});

describe('Matching', () => {
	const pairsOf = (payload: Extract<ItemPayload, { type: 'matching' }>) =>
		payload.pairs.map((pair) => [
			payload.left.find((item) => item.id === pair.left_id)?.text,
			payload.right.find((item) => item.id === pair.right_id)?.text
		]);

	it('pairs each item with the answer beside it, and adds the extra answers', () => {
		const payload = payloadOf('matching');
		expect(pairsOf(payload)).toEqual([
			['Cat', 'Kitten'],
			['Dog', 'Puppy'],
			['Cow', 'Calf']
		]);
		expect(payload.right.map((item) => item.text)).toEqual(['Kitten', 'Puppy', 'Calf', 'Chick']);
	});

	it('makes one answer of the same words written twice', () => {
		const payload = payloadOf('matching', { right_2: 'Kitten', extras: 'Kitten | Chick' });
		expect(payload.right.map((item) => item.text)).toEqual(['Kitten', 'Calf', 'Chick']);
		expect(pairsOf(payload)).toEqual([
			['Cat', 'Kitten'],
			['Dog', 'Kitten'],
			['Cow', 'Calf']
		]);
	});

	it('names the half of a pair that is missing', () => {
		expect(problemOf('matching', { right_2: '' })).toEqual({
			column: 'Answer 2',
			message: m.item_pair_required()
		});
		expect(problemOf('matching', { left_3: '' })).toEqual({
			column: 'Item 3',
			message: m.item_entry_empty()
		});
		expect(problemOf('matching', { left_2: 'Cat' })).toEqual({
			column: 'Item 2',
			message: m.item_entry_repeated()
		});
	});
});

describe('Ordering and Sentence Rearrangement', () => {
	it('keeps the items in the order of their columns', () => {
		const payload = payloadOf('ordering', { item_2: '' });
		expect(payload.items.map((item) => item.text)).toEqual(['Egg', 'Pupa', 'Butterfly']);
		expect(payload.correct_order).toEqual(payload.items.map((item) => item.id));
		expect(new Set(payload.correct_order).size).toBe(3);
	});

	it('names the item that repeats another, and no column for too few', () => {
		expect(problemOf('ordering', { item_4: 'Egg' })).toEqual({
			column: 'Item 4',
			message: m.item_entry_repeated()
		});
		expect(problemOf('ordering', { item_2: '', item_3: '', item_4: '' })).toEqual({
			column: null,
			message: m.item_ordering_too_few()
		});
	});

	it('cuts a sentence into chips, in order', () => {
		const payload = payloadOf('rearrange');
		expect(payload.items.map((item) => item.text)).toEqual([
			'The',
			'cat',
			'sat',
			'on',
			'the',
			'mat',
			'.'
		]);
		expect(payload.correct_order).toEqual(payload.items.map((item) => item.id));
	});

	it('cuts a Chinese sentence at its spaces, or into characters when it has none', () => {
		const chips = (sentence: string) =>
			payloadOf('rearrange', { sentence }).items.map((item) => item.text);
		expect(chips('小猫 在 花园里 玩耍。')).toEqual(['小猫', '在', '花园里', '玩耍', '。']);
		expect(chips('我爱你')).toEqual(['我', '爱', '你']);
	});

	it('names the Sentence column for a sentence of one word', () => {
		expect(problemOf('rearrange', { sentence: 'Go' })).toEqual({
			column: 'Sentence',
			message: m.item_sentence_too_short()
		});
	});
});

describe('Classify', () => {
	it('puts each group’s items in it', () => {
		const payload = payloadOf('classify');
		const group = (id: string) => payload.groups.find((each) => each.id === id)?.text;
		expect(payload.groups.map((each) => each.text)).toEqual(['Living things', 'Non-living things']);
		expect(payload.items.map((item) => [item.text, group(item.group_id)])).toEqual([
			['Cat', 'Living things'],
			['Tree', 'Living things'],
			['Bird', 'Living things'],
			['Rock', 'Non-living things'],
			['Chair', 'Non-living things']
		]);
	});

	it('names the group with no name, and the items that repeat', () => {
		expect(problemOf('classify', { group_2: '' })).toEqual({
			column: 'Group 2',
			message: m.item_group_name_required()
		});
		expect(problemOf('classify', { items_2: 'Rock | Cat' })).toEqual({
			column: 'Group 2 Items',
			message: m.item_entry_repeated()
		});
		expect(problemOf('classify', { group_2: '', items_2: '' })).toEqual({
			column: null,
			message: m.item_groups_count()
		});
	});
});

describe('readPassageRow', () => {
	it('names the cell that is empty', () => {
		const { code, title, text } = PASSAGE_SHEET.sample;
		expect(readPassageRow({ code: '', title, text })).toEqual({
			ok: false,
			problem: { column: 'Code', message: m.practice_import_cell_empty() }
		});
		expect(readPassageRow({ code, title: '', text })).toEqual({
			ok: false,
			problem: { column: 'Title', message: m.practice_passage_title_required() }
		});
		expect(readPassageRow({ code, title, text: '' })).toEqual({
			ok: false,
			problem: { column: 'Text', message: m.practice_import_cell_empty() }
		});
	});
});

describe('readRows', () => {
	const short = sheetOf('short_answer');
	const mcq = sheetOf('mcq');
	const answer = (question: string, more: Cells = {}): Cells => ({
		question,
		answers: 'yes',
		...more
	});
	const rows = (...cells: Cells[]): SheetRow[] =>
		cells.map((each, index) => ({ row: index + 2, cells: each }));

	it('reads nothing from a workbook that still holds only the examples', () => {
		const read = readRows(SHEETS.map((sheet) => ({ sheet, rows: rows(sheet.sample) })));
		expect(read).toEqual({
			candidates: { passages: [], questions: [] },
			problems: [],
			questionRows: 0
		});
	});

	it('passes over empty rows, wherever they are, and keeps the numbers of the others', () => {
		const read = readRows([
			{
				sheet: short,
				rows: rows(short.sample, answer('One?'), {}, { question: '', answers: '' }, answer(''), {})
			}
		]);
		expect(read.questionRows).toBe(2);
		expect(read.candidates.questions.map((each) => each.payload.question)).toEqual(['One?']);
		expect(read.problems).toEqual([
			{
				sheet: 'Short Answer',
				row: 6,
				reason: m.practice_import_at_column({
					column: 'Question',
					message: m.item_question_required()
				})
			}
		]);
	});

	it('imports the example once it has been written over', () => {
		const read = readRows([{ sheet: short, rows: rows({ ...short.sample, tip: 'A gas.' }) }]);
		expect(read.candidates.questions).toHaveLength(1);
	});

	it('lists the questions sheet by sheet in the order of the template, row by row', () => {
		const read = readRows([
			{ sheet: short, rows: rows(answer('Short one?'), answer('Short two?')) },
			{ sheet: mcq, rows: rows({ ...mcq.sample, question: 'Choice?' }) }
		]);
		expect(read.candidates.questions.map((each) => each.payload.question)).toEqual([
			'Choice?',
			'Short one?',
			'Short two?'
		]);
	});

	it('joins a question to the passage whose code it writes, in any capitals', () => {
		const read = readRows([
			{ sheet: short, rows: rows(answer('On it?', { passage: 'p1' }), answer('Alone?')) },
			{ sheet: PASSAGE_SHEET, rows: rows({ code: 'P1', title: 'Rain', text: 'It rains.' }) }
		]);
		expect(read.candidates.passages).toEqual([{ code: 'p1', title: 'Rain', body: 'It rains.' }]);
		expect(read.candidates.questions.map((each) => each.passage)).toEqual(['p1', null]);
		expect(read.problems).toEqual([]);
	});

	it('holds back a question whose passage is not there, or needs fixing itself', () => {
		const read = readRows([
			{
				sheet: short,
				rows: rows(answer('Lost?', { passage: 'P9' }), answer('Waiting?', { passage: 'P2' }))
			},
			{
				sheet: PASSAGE_SHEET,
				rows: rows(
					{ code: 'P1', title: 'Rain', text: 'It rains.' },
					{ code: 'P2', title: '', text: 'No title.' },
					{ code: 'p1', title: 'Again', text: 'The same code.' }
				)
			}
		]);
		expect(read.candidates.questions).toEqual([]);
		expect(read.candidates.passages.map((each) => each.title)).toEqual(['Rain']);
		const at = (column: string, message: string) =>
			m.practice_import_at_column({ column, message });
		expect(read.problems).toEqual([
			{
				sheet: 'Short Answer',
				row: 2,
				reason: at('Passage', m.practice_import_passage_unknown({ code: 'P9' }))
			},
			{
				sheet: 'Short Answer',
				row: 3,
				reason: at('Passage', m.practice_import_passage_broken({ code: 'P2' }))
			},
			{ sheet: 'Passages', row: 3, reason: at('Title', m.practice_passage_title_required()) },
			{
				sheet: 'Passages',
				row: 4,
				reason: at('Code', m.practice_import_code_repeated({ code: 'p1' }))
			}
		]);
	});

	it('lists a row whose cells could not be had, and counts it as a question row', () => {
		const fault = { column: 'Accepted Answers', message: m.practice_import_date_cell() };
		const read = readRows([{ sheet: short, rows: [{ row: 2, fault }] }]);
		expect(read.questionRows).toBe(1);
		expect(read.problems).toEqual([
			{ sheet: 'Short Answer', row: 2, reason: m.practice_import_at_column(fault) }
		]);
	});

	it('says a problem that is no one column’s without naming one', () => {
		const read = readRows([
			{ sheet: mcq, rows: rows({ question: 'One option?', option_A: 'Yes', answer: 'A' }) }
		]);
		expect(read.problems).toEqual([
			{ sheet: 'Multiple Choice', row: 2, reason: m.item_options_too_few() }
		]);
	});
});
