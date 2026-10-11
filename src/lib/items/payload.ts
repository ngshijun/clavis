/**
 * The item payload: what `questions.payload` stores for one practice question.
 * These types describe a COMPLETE question, key for key as the database
 * validator (`public.item_payload_is_valid`) and `schema.ts` accept it.
 */

/** The fourteen practice types, in the order the builder lists them. */
export const ITEM_TYPES = [
	'mcq',
	'mrq',
	'true_false',
	'tick_table',
	'pick_words',
	'cloze',
	'short_answer',
	'word_completion',
	'numeric',
	'matching',
	'ordering',
	'rearrange',
	'classify',
	'label_picture'
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** A question's difficulty: MOE's Rendah, Sederhana and Tinggi. */
export const DIFFICULTIES = ['low', 'medium', 'high'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The forms a Number answer can take. A payload without `form` is a `number`. */
export const NUMERIC_FORMS = [
	'number',
	'fraction',
	'mixed',
	'ratio',
	'money',
	'time',
	'measure'
] as const;
export type NumericForm = (typeof NUMERIC_FORMS)[number];

/** How a pupil fills the blanks of a text. A payload without `mode` is `typing`. */
export const CLOZE_MODES = ['typing', 'bank', 'choices'] as const;
export type ClozeMode = (typeof CLOZE_MODES)[number];

/** How a pupil names the parts of a picture. */
export const LABEL_MODES = ['typing', 'bank'] as const;
export type LabelMode = (typeof LABEL_MODES)[number];

/**
 * The answer words a True or False question can show: the word for true, then
 * the word for false. They are in the language of the question, not of the
 * person reading the page, so they are not translated.
 */
export const TRUE_FALSE_WORDS = [
	['True', 'False'],
	['Betul', 'Salah'],
	['Benar', 'Palsu'],
	['Ya', 'Tidak'],
	['Yes', 'No'],
	['对', '错']
] as const satisfies readonly [string, string][];

/** The unit pairs a measure in two units offers: the larger unit, then the smaller. */
export const MEASURE_UNITS = [
	['ℓ', 'mℓ'],
	['km', 'm'],
	['m', 'cm'],
	['kg', 'g'],
	['hours', 'minutes'],
	['RM', 'sen']
] as const satisfies readonly [string, string][];

/**
 * One thing a pupil moves, joins or sorts: words, a picture, or both. Its id is
 * a random short string, never its position, so an id gives no answer away.
 */
export type Item = { id: string; text: string; image_path?: string | null };

/** A column of a tick table, or a group to sort into. */
export type Group = { id: string; text: string };

/** What every type carries. */
interface Common {
	question: string;
	image_path?: string | null;
	tip?: string | null;
}

export interface ChoiceOption {
	text: string;
	is_correct: boolean;
	image_path?: string | null;
	tip?: string | null;
}

export interface McqPayload extends Common {
	type: 'mcq';
	options: ChoiceOption[];
}

export interface MrqPayload extends Common {
	type: 'mrq';
	options: ChoiceOption[];
}

export interface TrueFalsePayload extends Common {
	type: 'true_false';
	answer: boolean;
	/** The word for true, then the word for false. Absent: the runner's own words. */
	labels?: [string, string] | null;
}

export interface TickTablePayload extends Common {
	type: 'tick_table';
	/** The columns. */
	groups: Group[];
	/** The rows; `group_id` is the column that is right for the row. */
	items: { id: string; text: string; group_id: string }[];
}

export interface PickWordsPayload extends Common {
	type: 'pick_words';
	/** The sentence cut into words, in order. */
	options: { text: string; is_correct: boolean }[];
}

export interface ClozeBlank {
	index: number;
	accepted: string[];
	choices?: string[];
}

export interface ClozePayload extends Omit<Common, 'question'> {
	type: 'cloze';
	/** An optional lead-in: the text itself is what the pupil reads. */
	question?: string;
	/** The text, with `{{n}}` where blank `n` goes. */
	text: string;
	blanks: ClozeBlank[];
	mode?: ClozeMode;
	/** Word bank: extra words that are no blank's answer. */
	distractors?: string[];
	/** Word bank: a word can be used more than once. */
	reuse?: boolean;
}

export interface ShortAnswerPayload extends Common {
	type: 'short_answer';
	accepted_answers: string[];
}

export interface WordCompletionPayload extends Common {
	type: 'word_completion';
	answer: string;
	reveal_first?: boolean;
}

interface NumericCommon extends Common {
	type: 'numeric';
}

export interface NumericNumberPayload extends NumericCommon {
	form?: 'number';
	answer: number;
	tolerance?: number | null;
	unit?: string | null;
}

export interface NumericMoneyPayload extends NumericCommon {
	form: 'money';
	/** In ringgit: 19.2 is RM19.20. */
	answer: number;
}

export interface NumericFractionPayload extends NumericCommon {
	form: 'fraction';
	/** Numerator, denominator. */
	parts: [number, number];
	/** Also accept equal fractions. */
	equivalent?: boolean;
}

export interface NumericMixedPayload extends NumericCommon {
	form: 'mixed';
	/** Whole number, numerator, denominator. */
	parts: [number, number, number];
	/** Also accept the improper fraction. */
	improper?: boolean;
	unit?: string | null;
}

export interface NumericRatioPayload extends NumericCommon {
	form: 'ratio';
	parts: [number, number] | [number, number, number];
	/** Also accept equal ratios. */
	equivalent?: boolean;
}

export interface NumericTimePayload extends NumericCommon {
	form: 'time';
	/** Hour, minute. */
	parts: [number, number];
	/** Null: the 24-hour clock. */
	period: 'am' | 'pm' | null;
}

export interface NumericMeasurePayload extends NumericCommon {
	form: 'measure';
	/** The amount in the larger unit, then in the smaller. */
	parts: [number, number];
	units: [string, string];
}

export type NumericPayload =
	| NumericNumberPayload
	| NumericMoneyPayload
	| NumericFractionPayload
	| NumericMixedPayload
	| NumericRatioPayload
	| NumericTimePayload
	| NumericMeasurePayload;

export interface MatchingPayload extends Common {
	type: 'matching';
	left: Item[];
	/** May hold answers no pair uses, and one answer may serve several left items. */
	right: Item[];
	/** Exactly one a left item. */
	pairs: { left_id: string; right_id: string }[];
}

export interface OrderingPayload extends Common {
	type: 'ordering';
	items: Item[];
	/** The item ids, in the right order. */
	correct_order: string[];
}

export interface RearrangePayload extends Common {
	type: 'rearrange';
	/** The chips of the sentence. */
	items: { id: string; text: string }[];
	correct_order: string[];
}

export interface ClassifyPayload extends Common {
	type: 'classify';
	groups: Group[];
	items: (Item & { group_id: string })[];
}

export interface LabelPicturePayload extends Common {
	type: 'label_picture';
	/** The picture being labelled: this type cannot do without it. */
	image_path: string;
	/** `x` and `y` are percentages of the picture's width and height, 0 to 100. */
	labels: { id: string; text: string; x: number; y: number }[];
	mode: LabelMode;
	/** Word bank: extra words that are no label's answer. */
	distractors?: string[];
}

export type ItemPayload =
	| McqPayload
	| MrqPayload
	| TrueFalsePayload
	| TickTablePayload
	| PickWordsPayload
	| ClozePayload
	| ShortAnswerPayload
	| WordCompletionPayload
	| NumericPayload
	| MatchingPayload
	| OrderingPayload
	| RearrangePayload
	| ClassifyPayload
	| LabelPicturePayload;
