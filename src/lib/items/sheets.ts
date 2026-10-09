import { m } from '#lib/paraglide/messages.js';
import { validatePassage } from '#lib/passage.js';
import {
	MAX_IMPORT_QUESTIONS,
	passageCode,
	type CandidatePassage,
	type CandidateQuestion,
	type Candidates,
	type ImportProblem
} from './import.js';
import { newId } from './kinds.js';
import {
	DIFFICULTIES,
	TRUE_FALSE_WORDS,
	type ClozeMode,
	type Difficulty,
	type ItemType,
	type NumericForm
} from './payload.js';
import { validateItem } from './schema.js';
import { clozeFromBrackets, sentenceToChips } from './text.js';

/**
 * The sheets of the import workbook: one a question type, and one of passages.
 * The template is written from these definitions and a filled workbook is read
 * by them, so the two cannot drift apart.
 *
 * Everything a teacher reads in the workbook (sheet names, headers, the words
 * a cell may hold, the notes) is in English whatever language the page is in:
 * a file is passed from one teacher to the next. What the review says about a
 * row is in the reader's language.
 */

/** A row's cells as text, by column key. A cell left empty, or whose column is gone, is ''. */
export type Cells = Record<string, string>;

/**
 * The pictures placed in a row's cells, by column key: each as a question
 * names a picture that is not stored yet. A cell with none has no key.
 */
export type Pictures = Record<string, string>;

export interface Column {
	key: string;
	/** The words in the header row, which is how the column is found when the file comes back. */
	header: string;
	/** In characters, in the template. */
	width: number;
	/** A column the sheet cannot be read without. */
	required?: boolean;
	/** A column whose cell may hold a picture. One placed in any other column is a mistake. */
	picture?: boolean;
}

export interface Sheet {
	/** The name on the sheet's tab. */
	name: string;
	columns: Column[];
	/** The example in row 2 of the template. It is never imported. */
	sample: Cells;
	/** What the Read me sheet says about filling this one. */
	notes: string[];
}

type Path = (string | number)[];

/** A row made into a question's own keys, and the column each key was read from. */
interface Built {
	own: Record<string, unknown>;
	/** The key of the column a payload path was read from, if it was read from one. */
	column: (path: Path) => string | undefined;
}

export interface QuestionSheet extends Sheet {
	/** Label a Picture has no sheet: its labels are put on the picture, which a sheet cannot do. */
	type: Exclude<ItemType, 'label_picture'>;
	build: (cells: Cells, pictures: Pictures) => Built;
}

/** What is wrong with a row, and the header of the column it is wrong in, if it is one column's. */
export interface RowProblem {
	column: string | null;
	message: string;
}

/** A mistake found while a row is being read, before the question's own rules are asked. */
class Refusal extends Error {
	constructor(
		readonly column: string,
		message: string
	) {
		super(message);
	}
}

function refuse(column: string, message: string): never {
	throw new Refusal(column, message);
}

/** The things one cell holds, written with `|` between them. */
function list(cell: string): string[] {
	return cell
		.split('|')
		.map((each) => each.trim())
		.filter(Boolean);
}

/** A Yes or No cell. Left empty it is No. A cell Excel made a boolean arrives as TRUE or FALSE. */
function yesNo(cells: Cells, key: string): boolean {
	const written = (cells[key] ?? '').toLowerCase();
	if (['', 'no', 'n', 'false'].includes(written)) return false;
	if (['yes', 'y', 'true'].includes(written)) return true;
	return refuse(key, m.practice_import_yes_no());
}

const upTo = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

// ---- The columns every question sheet has ----------------------------------

const QUESTION: Column = { key: 'question', header: 'Question', width: 48, required: true };

/** The cell a question's own picture is placed in, and a passage's. It holds no words. */
const PICTURE: Column = { key: 'picture', header: 'Picture', width: 16, picture: true };

/** What a sheet asks with: the question, under the header given, and its picture. */
const asked = (question: Partial<Column> = {}): Column[] => [{ ...QUESTION, ...question }, PICTURE];

const FILING: Column[] = [
	{ key: 'difficulty', header: 'Difficulty', width: 12 },
	{ key: 'tip', header: 'Tip', width: 32 },
	{ key: 'passage', header: 'Passage', width: 10 }
];

/** Left empty, a question is of medium difficulty. */
const DIFFICULTY_WORDS = new Map<string, Difficulty>([
	['', 'medium'],
	...DIFFICULTIES.map((each): [string, Difficulty] => [each, each])
]);

// ---- Multiple Choice, Multiple Response ------------------------------------

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const choiceColumns = (answer: string): Column[] => [
	...asked(),
	...LETTERS.map((letter) => ({
		key: `option_${letter}`,
		header: `Option ${letter}`,
		width: 18,
		picture: true
	})),
	{ key: 'answer', header: answer, width: 10, required: true },
	...FILING
];

const choice =
	(type: 'mcq' | 'mrq') =>
	(cells: Cells, pictures: Pictures): Built => {
		// An option keeps the letter of its column, so an empty column in between changes no answer.
		const filled = LETTERS.filter(
			(letter) => cells[`option_${letter}`] || pictures[`option_${letter}`]
		);
		const picked = cells.answer
			.toUpperCase()
			.split(/[\s,;|/&]+/)
			.filter(Boolean);
		const wrong =
			type === 'mcq' ? m.practice_import_answer_letter() : m.practice_import_answer_letters();
		if (picked.some((letter) => !filled.includes(letter))) refuse('answer', wrong);
		if (type === 'mcq' && picked.length > 1) refuse('answer', wrong);

		return {
			own: {
				// The tip of these two types is on their wrong options: a pupil who picks one gets it.
				tip: undefined,
				options: filled.map((letter) => {
					const is_correct = picked.includes(letter);
					return {
						text: cells[`option_${letter}`],
						image_path: pictures[`option_${letter}`],
						is_correct,
						tip: is_correct ? undefined : cells.tip
					};
				})
			},
			column: ([key, index]) => {
				if (key !== 'options') return undefined;
				if (typeof index === 'number') return `option_${filled[index]}`;
				// About the list as a whole: too few options is no one column's, the rest is the answer's.
				return filled.length < 2 ? undefined : 'answer';
			}
		};
	};

// ---- True or False ---------------------------------------------------------

function trueFalse(cells: Cells): Built {
	const written = cells.answer.toLowerCase();
	const words = TRUE_FALSE_WORDS.find((pair) =>
		pair.some((word) => word.toLowerCase() === written)
	);
	if (!words) return refuse('answer', m.practice_import_true_false());
	return {
		own: {
			answer: words[0].toLowerCase() === written,
			// True and False are the runner's own words, which follow the reader's language. Any
			// other pair is the language of the question, so pupils choose between those words.
			labels: words === TRUE_FALSE_WORDS[0] ? undefined : [...words]
		},
		column: () => 'answer'
	};
}

// ---- Tick Table ------------------------------------------------------------

const TICK_ROWS = upTo(8);

function tickTable(cells: Cells): Built {
	const groups = list(cells.columns).map((text) => ({ id: newId(), text }));
	const used = TICK_ROWS.filter((n) => cells[`row_${n}`] || cells[`tick_${n}`]);
	const items = used.map((n) => {
		const tick = cells[`tick_${n}`];
		const group = groups.find((each) => each.text.toLowerCase() === tick.toLowerCase());
		if (tick && !group) refuse(`tick_${n}`, m.practice_import_not_a_column({ value: tick }));
		return { id: newId(), text: cells[`row_${n}`], group_id: group?.id ?? '' };
	});
	return {
		own: { groups, items },
		column: ([key, index, inner]) => {
			if (key === 'groups') return 'columns';
			if (key !== 'items') return undefined;
			if (typeof index !== 'number') return 'row_1';
			return `${inner === 'group_id' ? 'tick' : 'row'}_${used[index]}`;
		}
	};
}

// ---- Pick Words ------------------------------------------------------------

/** A sentence cut at its spaces, with the words written in [square brackets] marked as answers. */
function markedWords(sentence: string): { text: string; is_correct: boolean }[] {
	const words: { text: string; is_correct: boolean }[] = [];
	let text = '';
	let marked = false;
	let inside = false;
	const close = () => {
		if (text) words.push({ text, is_correct: marked });
		text = '';
		marked = false;
	};
	for (const character of sentence) {
		if (character === '[') inside = true;
		else if (character === ']') inside = false;
		else if (/\s/.test(character)) close();
		else {
			text += character;
			// Punctuation stays on its word, so a word is an answer if any of it is in brackets.
			marked ||= inside;
		}
	}
	close();
	return words;
}

function pickWords(cells: Cells): Built {
	const options = markedWords(cells.sentence);
	if (options.length > 0 && !options.some((word) => word.is_correct)) {
		refuse('sentence', m.practice_import_pick_words_brackets());
	}
	return { own: { options }, column: () => 'sentence' };
}

// ---- Fill in the Blanks ----------------------------------------------------

const CLOZE_MODE_WORDS = new Map<string, ClozeMode>([
	['', 'typing'],
	['typing', 'typing'],
	['word bank', 'bank'],
	['choices', 'choices']
]);

function cloze(cells: Cells): Built {
	const mode = CLOZE_MODE_WORDS.get(cells.mode.toLowerCase());
	if (!mode) return refuse('mode', m.practice_import_cloze_mode());
	if (mode !== 'bank' && cells.extra) refuse('extra', m.practice_import_cloze_extra());

	const { text, blanks } = clozeFromBrackets(cells.text);
	const answers = blanks.map((blank) => blank.accepted[0]).filter(Boolean);
	return {
		own: {
			text,
			// For a choice at each blank the first word written is the answer and all are the choices.
			blanks:
				mode === 'choices'
					? blanks.map((blank) => ({
							index: blank.index,
							accepted: blank.accepted.slice(0, 1),
							choices: blank.accepted
						}))
					: blanks,
			mode: mode === 'typing' ? undefined : mode,
			...(mode === 'bank'
				? {
						distractors: list(cells.extra),
						// The bank holds each answer once, so an answer two blanks share has to be reusable.
						reuse: new Set(answers).size < answers.length ? true : undefined
					}
				: {})
		},
		column: ([key]) => (key === 'distractors' ? 'extra' : 'text')
	};
}

// ---- Short Answer, Word Completion -----------------------------------------

function shortAnswer(cells: Cells): Built {
	return { own: { accepted_answers: list(cells.answers) }, column: () => 'answers' };
}

function wordCompletion(cells: Cells): Built {
	return {
		own: { answer: cells.word, reveal_first: yesNo(cells, 'reveal') || undefined },
		column: () => 'word'
	};
}

// ---- Number ----------------------------------------------------------------

/** The answer forms by the names the builder gives them, and by a short name for the long ones. */
const FORM_WORDS = new Map<string, NumericForm>([
	['', 'number'],
	['number', 'number'],
	['fraction', 'fraction'],
	['mixed number', 'mixed'],
	['mixed', 'mixed'],
	['ratio', 'ratio'],
	['money', 'money'],
	['time', 'time'],
	['measure in two units', 'measure'],
	['measure', 'measure']
]);

const FORM_NAMES: Record<NumericForm, string> = {
	number: 'Number',
	fraction: 'Fraction',
	mixed: 'Mixed Number',
	ratio: 'Ratio',
	money: 'Money',
	time: 'Time',
	measure: 'Measure'
};

/** The columns beside the answer that each form reads. One filled in for another form is a mistake. */
const FORM_COLUMNS: Record<NumericForm, string[]> = {
	number: ['unit', 'tolerance'],
	fraction: ['equal'],
	mixed: ['unit', 'equal'],
	ratio: ['equal'],
	money: [],
	time: [],
	measure: []
};

/** A number as a person writes it: 1,500 and 1 500 are both 1500. NaN for anything else. */
function toNumber(written: string): number {
	const digits = written.replace(/[\s,]/g, '');
	return digits === '' ? NaN : Number(digits);
}

/** The answer cell, read in its form. */
function numericAnswer(form: NumericForm, written: string): Record<string, unknown> {
	const value = written;
	switch (form) {
		case 'number':
		case 'money': {
			const answer = toNumber(form === 'money' ? written.replace(/^rm\s*/i, '') : written);
			if (Number.isNaN(answer)) refuse('answer', m.practice_import_not_number({ value }));
			return { answer };
		}
		case 'fraction': {
			const found = /^(\d+)\s*\/\s*(\d+)$/.exec(written);
			if (!found) return refuse('answer', m.practice_import_not_fraction({ value }));
			return { parts: [Number(found[1]), Number(found[2])] };
		}
		case 'mixed': {
			const found = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(written);
			if (!found) return refuse('answer', m.practice_import_not_mixed({ value }));
			return { parts: [Number(found[1]), Number(found[2]), Number(found[3])] };
		}
		case 'ratio': {
			if (!/^\d+(\s*:\s*\d+){1,2}$/.test(written)) {
				refuse('answer', m.practice_import_not_ratio({ value }));
			}
			return { parts: written.split(':').map((term) => Number(term.trim())) };
		}
		case 'time': {
			// 5.50 p.m., 5:50 pm and 17:50 are all times; with no a.m. or p.m. it is the 24-hour clock.
			const found = /^(\d{1,2})\s*[:.]\s*(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/i.exec(written);
			if (!found) return refuse('answer', m.practice_import_not_time({ value }));
			const period = found[3] ? (found[3][0].toLowerCase() === 'a' ? 'am' : 'pm') : null;
			return { parts: [Number(found[1]), Number(found[2])], period };
		}
		case 'measure': {
			const found = /^(\d+)\s*([^\d\s]+)\s+(\d+)\s*([^\d\s]+)$/.exec(written);
			if (!found) return refuse('answer', m.practice_import_not_measure({ value }));
			return { parts: [Number(found[1]), Number(found[3])], units: [found[2], found[4]] };
		}
	}
}

function numeric(cells: Cells): Built {
	const form = FORM_WORDS.get(cells.form.toLowerCase());
	if (!form) return refuse('form', m.practice_import_numeric_form());
	if (!cells.answer) refuse('answer', m.practice_import_cell_empty());

	const equal = yesNo(cells, 'equal');
	const filled = { unit: cells.unit !== '', tolerance: cells.tolerance !== '', equal };
	for (const key of ['unit', 'tolerance', 'equal'] as const) {
		if (filled[key] && !FORM_COLUMNS[form].includes(key)) {
			refuse(key, m.practice_import_numeric_unused({ form: FORM_NAMES[form] }));
		}
	}

	const tolerance = cells.tolerance === '' ? undefined : toNumber(cells.tolerance);
	if (Number.isNaN(tolerance)) {
		refuse('tolerance', m.practice_import_not_number({ value: cells.tolerance }));
	}

	return {
		own: {
			form,
			...numericAnswer(form, cells.answer),
			unit: cells.unit,
			tolerance,
			// One column for the three allowances, since each form has at most one of them.
			...(form === 'mixed' ? { improper: equal || undefined } : { equivalent: equal || undefined })
		},
		column: ([key]) => (key === 'unit' || key === 'tolerance' ? key : 'answer')
	};
}

// ---- Matching --------------------------------------------------------------

/** What an item or an answer shows a pupil: its words, its picture, or both. */
type Shown = { text: string; image_path?: string };

const holds = (entry: Shown) => entry.text !== '' || entry.image_path !== undefined;

const PAIRS = upTo(8);

function matching(cells: Cells, pictures: Pictures): Built {
	const shown = (key: string): Shown => ({ text: cells[key], image_path: pictures[key] });
	const used = PAIRS.filter((n) => holds(shown(`left_${n}`)) || holds(shown(`right_${n}`)));
	const left = used.map((n) => ({ id: newId(), ...shown(`left_${n}`) }));

	// One answer serves two items by being paired twice, so what shows the same is one answer.
	const right: ({ id: string } & Shown)[] = [];
	const answer = (entry: Shown) => {
		const known = right.find(
			(each) => each.text === entry.text && each.image_path === entry.image_path
		);
		if (known) return known;
		right.push({ id: newId(), ...entry });
		return right[right.length - 1];
	};
	const pairs = used.flatMap((n, index) => {
		const entry = shown(`right_${n}`);
		return holds(entry) ? [{ left_id: left[index].id, right_id: answer(entry).id }] : [];
	});
	list(cells.extras).forEach((text) => answer({ text }));

	return {
		own: { left, right, pairs },
		column: ([key, index, inner]) => {
			if (key !== 'left' || typeof index !== 'number') return undefined;
			// An item with no words is the item's own column; one with no pair is its answer's.
			return `${inner === 'text' ? 'left' : 'right'}_${used[index]}`;
		}
	};
}

// ---- Ordering, Sentence Rearrangement --------------------------------------

const ORDER_ITEMS = upTo(8);

function ordering(cells: Cells, pictures: Pictures): Built {
	const used = ORDER_ITEMS.filter((n) => cells[`item_${n}`] || pictures[`item_${n}`]);
	const items = used.map((n) => ({
		id: newId(),
		text: cells[`item_${n}`],
		image_path: pictures[`item_${n}`]
	}));
	return {
		own: { items, correct_order: items.map((item) => item.id) },
		column: ([key, index]) =>
			key === 'items' && typeof index === 'number' ? `item_${used[index]}` : undefined
	};
}

function rearrange(cells: Cells): Built {
	const items = sentenceToChips(cells.sentence).map((text) => ({ id: newId(), text }));
	return {
		own: { items, correct_order: items.map((item) => item.id) },
		column: () => 'sentence'
	};
}

// ---- Classify --------------------------------------------------------------

const GROUPS = upTo(4);

function classify(cells: Cells): Built {
	const used = GROUPS.filter((n) => cells[`group_${n}`] || cells[`items_${n}`]);
	const groups = used.map((n) => ({ id: newId(), text: cells[`group_${n}`] }));
	const items = used.flatMap((n, index) =>
		list(cells[`items_${n}`]).map((text) => ({ id: newId(), text, group_id: groups[index].id, n }))
	);
	return {
		own: { groups, items: items.map(({ id, text, group_id }) => ({ id, text, group_id })) },
		column: ([key, index]) => {
			if (typeof index !== 'number') return undefined;
			if (key === 'groups') return `group_${used[index]}`;
			return key === 'items' ? `items_${items[index].n}` : undefined;
		}
	};
}

// ---- The sheets ------------------------------------------------------------

const PIPE = 'Put | between them.';
const OPTION_PICTURES =
	'An option may be a picture, words, or both: place the picture in the option’s cell.';

/** The question sheets, in the order the builder lists the types. */
export const QUESTION_SHEETS: QuestionSheet[] = [
	{
		type: 'mcq',
		name: 'Multiple Choice',
		columns: choiceColumns('Answer'),
		sample: {
			question: 'Which part of a plant takes in water?',
			option_A: 'Roots',
			option_B: 'Stem',
			option_C: 'Leaf',
			option_D: 'Flower',
			answer: 'A',
			difficulty: 'Low',
			tip: 'This part is under the ground.'
		},
		notes: [
			'Fill in two to six options. Answer is the letter of the one right option, such as B.',
			OPTION_PICTURES,
			'Tip is shown to a pupil who picks a wrong option.'
		],
		build: choice('mcq')
	},
	{
		type: 'mrq',
		name: 'Multiple Response',
		columns: choiceColumns('Answers'),
		sample: {
			question: 'Which of these are parts of a plant?',
			option_A: 'Roots',
			option_B: 'Wheel',
			option_C: 'Leaf',
			option_D: 'Stem',
			answer: 'A, C, D',
			difficulty: 'Medium'
		},
		notes: [
			'Answers holds the letter of every right option, at least two of them, such as A, C.',
			OPTION_PICTURES,
			'Tip is shown to a pupil who picks a wrong option.'
		],
		build: choice('mrq')
	},
	{
		type: 'true_false',
		name: 'True or False',
		columns: [
			...asked({ header: 'Statement' }),
			{ key: 'answer', header: 'Answer', width: 12, required: true },
			...FILING
		],
		sample: { question: 'A plant makes its own food.', answer: 'True' },
		notes: [
			'Answer is True or False.',
			'Write Betul or Salah, Benar or Palsu, Ya or Tidak, Yes or No, or 对 or 错 instead, and pupils choose between those two words.'
		],
		build: trueFalse
	},
	{
		type: 'tick_table',
		name: 'Tick Table',
		columns: [
			...asked(),
			{ key: 'columns', header: 'Columns', width: 24, required: true },
			...TICK_ROWS.flatMap((n) => [
				{ key: `row_${n}`, header: `Row ${n}`, width: 20 },
				{ key: `tick_${n}`, header: `Tick ${n}`, width: 14 }
			]),
			...FILING
		],
		sample: {
			question: 'Tick the right column for each one.',
			columns: 'Living | Non-living',
			row_1: 'Cat',
			tick_1: 'Living',
			row_2: 'Rock',
			tick_2: 'Non-living',
			row_3: 'Tree',
			tick_3: 'Living'
		},
		notes: [
			`Columns holds the names of the two to five columns pupils tick under. ${PIPE}`,
			'Each Row is one line of the table. The Tick beside it is the name of the column that is right for it.'
		],
		build: tickTable
	},
	{
		type: 'pick_words',
		name: 'Pick Words',
		columns: [
			...asked(),
			{ key: 'sentence', header: 'Sentence', width: 48, required: true },
			...FILING
		],
		sample: {
			question: 'Pick the nouns in this sentence.',
			sentence: 'The [cat] sat on the [mat].'
		},
		notes: [
			'Write the sentence whole, with [square brackets] around each word that is an answer.',
			'The sentence is cut at its spaces, so put a space between the words of a Chinese sentence.'
		],
		build: pickWords
	},
	{
		type: 'cloze',
		name: 'Fill in the Blanks',
		columns: [
			...asked({ required: false }),
			{ key: 'text', header: 'Text', width: 56, required: true },
			{ key: 'mode', header: 'Answer Mode', width: 14 },
			{ key: 'extra', header: 'Extra Words', width: 20 },
			...FILING
		],
		sample: {
			question: 'Fill in the blanks.',
			text: 'The [roots] take in water and the [leaves] make food.',
			mode: 'Word Bank',
			extra: 'stem | flower'
		},
		notes: [
			'Write the text whole, with the answer to each blank in [square brackets]. For every spelling you accept, put | between them: [colour|color].',
			'Answer Mode is Typing, Word Bank or Choices. Left empty, it is Typing.',
			`Extra Words are for Word Bank only: words that fit no blank. ${PIPE}`,
			'For Choices, write two to four choices in each bracket, the answer first: [roots|leaves|stem].',
			'Question is optional on this sheet: a line above the text.'
		],
		build: cloze
	},
	{
		type: 'short_answer',
		name: 'Short Answer',
		columns: [
			...asked(),
			{ key: 'answers', header: 'Accepted Answers', width: 32, required: true },
			...FILING
		],
		sample: {
			question: 'Which gas do plants take in from the air?',
			answers: 'carbon dioxide | CO2'
		},
		notes: [`Accepted Answers holds every answer you accept. ${PIPE}`],
		build: shortAnswer
	},
	{
		type: 'word_completion',
		name: 'Word Completion',
		columns: [
			...asked({ header: 'Clue' }),
			{ key: 'word', header: 'Word', width: 20, required: true },
			{ key: 'reveal', header: 'Show First Letter', width: 18 },
			...FILING
		],
		sample: {
			question: 'The green part of a plant that makes food.',
			word: 'leaf',
			reveal: 'Yes'
		},
		notes: [
			'Word is one word with no spaces. Pupils get one box for each letter.',
			'Show First Letter is Yes or No. Left empty, it is No.'
		],
		build: wordCompletion
	},
	{
		type: 'numeric',
		name: 'Number',
		columns: [
			...asked(),
			{ key: 'form', header: 'Answer Form', width: 16 },
			{ key: 'answer', header: 'Answer', width: 16, required: true },
			{ key: 'unit', header: 'Unit', width: 10 },
			{ key: 'tolerance', header: 'Tolerance', width: 12 },
			{ key: 'equal', header: 'Accept Equal Answers', width: 22 },
			...FILING
		],
		sample: {
			question: 'What fraction of the pizza is left?',
			form: 'Fraction',
			answer: '3/4',
			equal: 'Yes'
		},
		notes: [
			'Answer Form is Number, Fraction, Mixed Number, Ratio, Money, Time or Measure. Left empty, it is Number.',
			'Write the answer in its form. Number: 12.5. Fraction: 3/4. Mixed Number: 2 1/2. Ratio: 3:4. Money: 19.20. Time: 7:30 am, or 19:30 on the 24-hour clock. Measure: 2 kg 500 g.',
			'Unit goes with Number and Mixed Number, such as cm.',
			'Tolerance goes with Number: with 0.1, an answer within 0.1 of yours is right.',
			'Accept Equal Answers is Yes or No. Yes also accepts equal fractions (2/4 for 1/2), equal ratios (2:4 for 1:2), or the improper fraction for a mixed number (5/2 for 2 1/2).'
		],
		build: numeric
	},
	{
		type: 'matching',
		name: 'Matching',
		columns: [
			...asked(),
			...PAIRS.flatMap((n) => [
				{ key: `left_${n}`, header: `Item ${n}`, width: 18, picture: true },
				{ key: `right_${n}`, header: `Answer ${n}`, width: 18, picture: true }
			]),
			{ key: 'extras', header: 'Extra Answers', width: 20 },
			...FILING
		],
		sample: {
			question: 'Match each animal to its young.',
			left_1: 'Cat',
			right_1: 'Kitten',
			left_2: 'Dog',
			right_2: 'Puppy',
			left_3: 'Cow',
			right_3: 'Calf',
			extras: 'Chick'
		},
		notes: [
			'Each Item and the Answer beside it are one right pair.',
			'To let one answer serve two items, write it the same both times.',
			'An item or an answer may be a picture, words, or both: place the picture in its cell.',
			`Extra Answers are shown with no partner. ${PIPE}`
		],
		build: matching
	},
	{
		type: 'ordering',
		name: 'Ordering',
		columns: [
			...asked(),
			...ORDER_ITEMS.map((n) => ({
				key: `item_${n}`,
				header: `Item ${n}`,
				width: 18,
				picture: true
			})),
			...FILING
		],
		sample: {
			question: 'Put the stages of a butterfly’s life in order.',
			item_1: 'Egg',
			item_2: 'Caterpillar',
			item_3: 'Pupa',
			item_4: 'Butterfly'
		},
		notes: [
			'Write the items in their right order. Pupils get them shuffled.',
			'An item may be a picture, words, or both: place the picture in its cell.'
		],
		build: ordering
	},
	{
		type: 'rearrange',
		name: 'Sentence Rearrangement',
		columns: [
			...asked(),
			{ key: 'sentence', header: 'Sentence', width: 48, required: true },
			...FILING
		],
		sample: {
			question: 'Put the words in order to make a sentence.',
			sentence: 'The cat sat on the mat.'
		},
		notes: [
			'Write the sentence in its right order. It is cut at its spaces into chips, which pupils get shuffled.',
			'Put a space between the words of a Chinese sentence, or it is cut into single characters.'
		],
		build: rearrange
	},
	{
		type: 'classify',
		name: 'Classify',
		columns: [
			...asked(),
			...GROUPS.flatMap((n) => [
				{ key: `group_${n}`, header: `Group ${n}`, width: 18 },
				{ key: `items_${n}`, header: `Group ${n} Items`, width: 28 }
			]),
			...FILING
		],
		sample: {
			question: 'Sort these into living and non-living things.',
			group_1: 'Living things',
			items_1: 'Cat | Tree | Bird',
			group_2: 'Non-living things',
			items_2: 'Rock | Chair'
		},
		notes: [`Name two to four groups, and write the items of each beside it. ${PIPE}`],
		build: classify
	}
];

export const PASSAGE_SHEET: Sheet = {
	name: 'Passages',
	columns: [
		{ key: 'code', header: 'Code', width: 10, required: true },
		{ key: 'title', header: 'Title', width: 28, required: true },
		PICTURE,
		{ key: 'text', header: 'Text', width: 80, required: true }
	],
	sample: {
		code: 'P1',
		title: 'The Water Cycle',
		text: 'The sun heats the sea, and water rises into the air as vapour. High up it cools and forms clouds. Rain falls from the clouds and runs back to the sea.'
	},
	notes: [
		'Code is a short name of your own, such as P1.',
		'Write the same code in the Passage column of each question that goes with the passage.',
		'A passage is its text, a picture placed in the Picture cell, or both.'
	]
};

/** Every sheet that is read, in the order the template has them. */
export const SHEETS: Sheet[] = [...QUESTION_SHEETS, PASSAGE_SHEET];

/** The name of the template's first sheet, which only explains the others and is never read. */
export const README_NAME = 'Read me';

/** What the Read me sheet says before it goes through the sheets one by one. */
export const README_RULES = [
	'Each sheet is one question type. Fill in the sheets you need and leave the rest. One row is one question.',
	'Keep the header row as it is. Row 2 of each sheet is an example: it is never imported, so type over it or leave it.',
	'Difficulty is Low, Medium or High. Left empty, it is Medium.',
	'Tip is optional. It is shown in the result to a pupil who gets the question wrong.',
	'Passage is optional: the code of a passage on the Passages sheet. The question then goes under that passage.',
	'The cells are formatted as text, so that 3/4 and 7:30 stay as you type them. In a file of your own, format the cells as Text before you type.',
	'To give a question a picture, place the picture in the Picture cell of its row. That cell holds the picture only, with no words.',
	'A picture belongs to the cell it is in. In Excel, choose Insert, Pictures, Place in Cell. A picture that floats over the sheet belongs to the cell its top left corner is in.',
	'Pictures are PNG, JPEG, WebP or GIF. A picture in a cell that takes none is listed as a row to fix.',
	'Label a Picture has no sheet: it is made in Clavis, where its labels are put on the picture.',
	'A question that is already in the stage, with the same pictures, is left out, so importing the same file again adds nothing twice.',
	`One file holds up to ${MAX_IMPORT_QUESTIONS} questions.`
];

// ---- Reading rows ----------------------------------------------------------

const headerOf = (sheet: Sheet, key: string | undefined) =>
	sheet.columns.find((column) => column.key === key)?.header ?? null;

/** The cells of a row with every column of its sheet there, so no reader meets `undefined`. */
function whole(sheet: Sheet, cells: Cells): Cells {
	return Object.fromEntries(sheet.columns.map((column) => [column.key, cells[column.key] ?? '']));
}

/**
 * One row of a question sheet as a complete question, or what is wrong with
 * it. The question is checked by the same rules as one saved in the builder;
 * the first thing wrong is what the row says, beside the column it was read
 * from.
 */
export function readQuestionRow(
	sheet: QuestionSheet,
	written: Cells,
	pictures: Pictures = {}
): { ok: true; question: CandidateQuestion } | { ok: false; problem: RowProblem } {
	const cells = whole(sheet, written);
	try {
		if (cells.picture) refuse('picture', m.practice_import_picture_words());
		const difficulty = DIFFICULTY_WORDS.get(cells.difficulty.toLowerCase());
		if (!difficulty) return refuse('difficulty', m.practice_import_difficulty());

		const built = sheet.build(cells, pictures);
		const checked = validateItem({
			type: sheet.type,
			question: cells.question,
			image_path: pictures.picture,
			tip: cells.tip,
			...built.own
		});
		if (!checked.ok) {
			const { path, message } = checked.issues[0];
			const own = { question: 'question', tip: 'tip', image_path: 'picture' }[String(path[0])];
			const key = own ?? built.column(path);
			return { ok: false, problem: { column: headerOf(sheet, key), message } };
		}
		return {
			ok: true,
			question: {
				payload: checked.payload,
				difficulty,
				passage: cells.passage ? passageCode(cells.passage) : null
			}
		};
	} catch (cause) {
		if (!(cause instanceof Refusal)) throw cause;
		return {
			ok: false,
			problem: { column: headerOf(sheet, cause.column), message: cause.message }
		};
	}
}

/** One row of the Passages sheet as a passage, or what is wrong with it. */
export function readPassageRow(
	written: Cells,
	pictures: Pictures = {}
): { ok: true; passage: CandidatePassage } | { ok: false; problem: RowProblem } {
	const cells = whole(PASSAGE_SHEET, written);
	const refused = (key: string, message: string) =>
		({ ok: false, problem: { column: headerOf(PASSAGE_SHEET, key), message } }) as const;
	if (!cells.code) return refused('code', m.practice_import_cell_empty());
	if (cells.picture) return refused('picture', m.practice_import_picture_words());

	const checked = validatePassage({
		title: cells.title,
		body: cells.text,
		image_path: pictures.picture
	});
	if (!checked.ok) {
		const { path, message } = checked.issues[0];
		const key = path[0] === 'body' ? 'text' : 'title';
		return { ok: false, problem: { column: headerOf(PASSAGE_SHEET, key), message } };
	}
	return {
		ok: true,
		passage: {
			code: passageCode(cells.code),
			title: checked.content.title,
			body: checked.content.body,
			image_path: checked.content.image_path
		}
	};
}

/**
 * A row as it comes off a workbook, with the number the spreadsheet shows
 * beside it. `fault` stands for a row whose cells could not be had as text,
 * or that has a picture where none can be taken.
 */
export type SheetRow = { row: number } & (
	{ cells: Cells; pictures?: Pictures } | { fault: RowProblem }
);

/**
 * The rows of a sheet that hold something to import. An empty row is no row,
 * wherever it is, and the template's example is left out when it is still
 * there untouched: a teacher fills one sheet and leaves twelve examples behind.
 * A row with a picture is neither.
 */
function filled(sheet: Sheet, rows: SheetRow[]): SheetRow[] {
	return rows.filter((row) => {
		if ('fault' in row || Object.keys(row.pictures ?? {}).length > 0) return true;
		const cells = whole(sheet, row.cells);
		const keys = sheet.columns.map((column) => column.key);
		const blank = keys.every((key) => cells[key] === '');
		const sample = keys.every((key) => cells[key] === (sheet.sample[key] ?? ''));
		return !blank && !sample;
	});
}

const reasonOf = ({ column, message }: RowProblem) =>
	column === null ? message : m.practice_import_at_column({ column, message });

/**
 * A workbook's rows as the candidates of an import, with the rows that need
 * fixing. `sheets` holds what was read off each sheet the workbook has; a
 * sheet it lacks is simply not there.
 *
 * `questionRows` counts every question row, good or not, which is what the
 * limit on a workbook is about.
 */
export function readRows(sheets: { sheet: Sheet; rows: SheetRow[] }[]): {
	candidates: Candidates;
	problems: ImportProblem[];
	questionRows: number;
} {
	const rowsOf = (sheet: Sheet) =>
		filled(sheet, sheets.find((each) => each.sheet === sheet)?.rows ?? []);
	const problems: ImportProblem[] = [];
	let questionRows = 0;

	// The passages are read first, so that a question can be told its code names none. Their
	// problems are listed last all the same, where their sheet is.
	const passages: CandidatePassage[] = [];
	const passageProblems: ImportProblem[] = [];
	/** The codes of the passages that need fixing: a question on one of them waits for it. */
	const broken = new Set<string>();
	for (const row of rowsOf(PASSAGE_SHEET)) {
		const refused = (problem: RowProblem) =>
			passageProblems.push({ sheet: PASSAGE_SHEET.name, row: row.row, reason: reasonOf(problem) });
		if ('fault' in row) {
			refused(row.fault);
			continue;
		}
		const read = readPassageRow(row.cells, row.pictures);
		if (!read.ok) {
			if (row.cells.code) broken.add(passageCode(row.cells.code));
			refused(read.problem);
		} else if (passages.some((each) => each.code === read.passage.code)) {
			refused({
				column: headerOf(PASSAGE_SHEET, 'code'),
				message: m.practice_import_code_repeated({ code: row.cells.code })
			});
		} else {
			passages.push(read.passage);
		}
	}

	const questions: CandidateQuestion[] = [];
	for (const sheet of QUESTION_SHEETS) {
		for (const row of rowsOf(sheet)) {
			questionRows += 1;
			const refused = (problem: RowProblem) =>
				problems.push({ sheet: sheet.name, row: row.row, reason: reasonOf(problem) });
			if ('fault' in row) {
				refused(row.fault);
				continue;
			}
			const read = readQuestionRow(sheet, row.cells, row.pictures);
			if (!read.ok) {
				refused(read.problem);
				continue;
			}
			const code = read.question.passage;
			if (code !== null && !passages.some((each) => each.code === code)) {
				const written = { code: row.cells.passage };
				refused({
					column: headerOf(sheet, 'passage'),
					message: broken.has(code)
						? m.practice_import_passage_broken(written)
						: m.practice_import_passage_unknown(written)
				});
				continue;
			}
			questions.push(read.question);
		}
	}

	return {
		candidates: { passages, questions },
		problems: [...problems, ...passageProblems],
		questionRows
	};
}
