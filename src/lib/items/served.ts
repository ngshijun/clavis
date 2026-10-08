/**
 * A question as a pupil gets it, and the answer a pupil gives.
 *
 * A served item is what the database hands out in place of a payload
 * (`app.sanitize_item_payload`): the same question with every answer taken
 * out and every list that would give one away mixed up. A response is what the
 * grader (`app.grade_item_response`) reads. Nothing here decides whether an
 * answer is right: that is the grader's alone.
 */
import type { ClozeMode, Group, ItemType, LabelMode, NumericForm } from './payload.js';

/** Where a picture is kept. Both are set, or neither is. */
interface Pictured {
	image_path: string | null;
	image_bucket: string | null;
}

/** A choice, numbered by its place in the payload: the number is what a pupil's pick names. */
export interface ServedOption extends Pictured {
	number: number;
	text: string;
}

/** Something a pupil moves, joins or sorts. */
export interface ServedThing extends Partial<Pictured> {
	id: string;
	text: string;
}

interface Common extends Pictured {
	question: string | null;
}

interface WithOptions<Type extends ItemType> extends Common {
	type: Type;
	options: ServedOption[];
}

export type ServedChoice = WithOptions<'mcq'> | WithOptions<'mrq'>;
export type ServedPickWords = WithOptions<'pick_words'>;

export interface ServedTrueFalse extends Common {
	type: 'true_false';
	/** The word for true, then the word for false; null for the runner's own. */
	labels: [string, string] | null;
}

export interface ServedTickTable extends Common {
	type: 'tick_table';
	groups: Group[];
	items: { id: string; text: string }[];
}

export interface ServedCloze extends Common {
	type: 'cloze';
	text: string;
	mode: ClozeMode;
	/** Word bank: whether a word may fill more than one blank. */
	reuse: boolean;
	blanks: { index: number; choices?: string[] }[];
	/** Word bank: the words to fill the blanks from. */
	bank: string[] | null;
}

export interface ServedShortAnswer extends Common {
	type: 'short_answer';
}

export interface ServedWordCompletion extends Common {
	type: 'word_completion';
	length: number;
	first_letter: string | null;
}

export interface ServedNumeric extends Common {
	type: 'numeric';
	form: NumericForm;
	unit: string | null;
	/** Measure: the larger unit, then the smaller. */
	units: [string, string] | null;
	/** Time: the clock the answer is given on. */
	clock: 12 | 24 | null;
	/** Ratio: how many terms it has. */
	terms: 2 | 3 | null;
}

export interface ServedMatching extends Common {
	type: 'matching';
	left: ServedThing[];
	right: ServedThing[];
}

interface WithSequence<Type extends ItemType> extends Common {
	type: Type;
	items: ServedThing[];
}

export type ServedOrdering = WithSequence<'ordering'>;
export type ServedRearrange = WithSequence<'rearrange'>;

export interface ServedClassify extends Common {
	type: 'classify';
	groups: Group[];
	items: ServedThing[];
}

export interface ServedLabelPicture extends Common {
	type: 'label_picture';
	mode: LabelMode;
	/** `number` is the part's number on the picture; `x` and `y` are percentages of its size. */
	markers: { id: string; number: number; x: number; y: number }[];
	/** Word bank: the words to label the parts from. */
	bank: string[] | null;
}

export type ServedItem =
	| ServedChoice
	| ServedPickWords
	| ServedTrueFalse
	| ServedTickTable
	| ServedCloze
	| ServedShortAnswer
	| ServedWordCompletion
	| ServedNumeric
	| ServedMatching
	| ServedOrdering
	| ServedRearrange
	| ServedClassify
	| ServedLabelPicture;

export type ServedOf<Type extends ItemType> = Extract<ServedItem, { type: Type }>;

/**
 * A pupil's answer to one question. Which keys carry it depends on the type;
 * an answer not given yet is an empty object.
 */
export interface ItemResponse {
	/** The numbers of the options picked. */
	selected_options?: number[];
	/** What was typed, for the types answered with one line of text. */
	text_answer?: string;
	response?: {
		/** True or False. */
		value?: boolean;
		/** The boxes of a fraction, mixed number, ratio, time or measure; null for an empty box. */
		parts?: (number | null)[];
		period?: 'am' | 'pm' | null;
		blanks?: { index: number; value: string }[];
		pairs?: { left_id: string; right_id: string }[];
		order?: string[];
		/** The rows of a tick table, or the items of a Classify, each under its group. */
		items?: { id: string; group_id: string }[];
		labels?: { id: string; value: string }[];
	};
}

/** Whether a pupil has put anything at all into an answer. */
export function isAnswered(answer: ItemResponse): boolean {
	const { selected_options, text_answer, response = {} } = answer;
	return (
		(selected_options?.length ?? 0) > 0 ||
		(text_answer ?? '').trim() !== '' ||
		response.value !== undefined ||
		(response.parts ?? []).some((part) => part !== null) ||
		(response.blanks ?? []).some((blank) => blank.value.trim() !== '') ||
		(response.labels ?? []).some((label) => label.value.trim() !== '') ||
		(response.pairs?.length ?? 0) > 0 ||
		(response.order?.length ?? 0) > 0 ||
		(response.items?.length ?? 0) > 0
	);
}
