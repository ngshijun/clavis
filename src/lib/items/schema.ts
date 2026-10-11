import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { isAbsent } from './absent.js';
import {
	MAX_ENTRIES,
	MAX_ENTRY_CHARS,
	MAX_ID_CHARS,
	MAX_IMAGE_PATH_CHARS,
	MAX_QUESTION_CHARS,
	MAX_TIP_CHARS,
	MAX_UNIT_CHARS,
	MAX_WORDS
} from './limits.js';
import { CLOZE_MODES, LABEL_MODES, type ItemPayload, type NumericRatioPayload } from './payload.js';
import { clozeSegments } from './text.js';

/**
 * What a COMPLETE question is, as the editor's Save and the server check it.
 * It agrees with `public.item_payload_is_valid` on every payload the database
 * accepts for practice, and refuses more: the database only guards the shape,
 * and this also refuses a question a pupil could not answer or tell apart.
 *
 * What comes out is tidied for storing, so that one question has one stored
 * form: text is trimmed, a key the type does not have is dropped, and an
 * optional value that says nothing (`isAbsent`: left empty, switched off) is a
 * key that is not there. So is a default that the absent key already means:
 * `mode: 'typing'` of a Fill in the Blanks, `form: 'number'` of a Number.
 */

type Path = (string | number)[];

/** One thing wrong with a question: `path` is the key it is wrong at, for the form to show it there. */
export type ItemIssue = { path: Path; message: string };

type Refuse = (path: Path, message: string) => void;

/**
 * A rule that looks at more than one key at once. Its refusals do not stop
 * the rules after it, so a form can show everything that is wrong in one go.
 */
function rule<T>(test: (value: T, refuse: Refuse) => void) {
	return (context: z.core.ParsePayload<T>) =>
		test(context.value, (path, message) =>
			context.issues.push({ code: 'custom', input: context.value, path, message, continue: true })
		);
}

/** Where in a list an entry repeats an earlier one. Empty entries repeat nothing. */
function repeats(values: string[]): number[] {
	const seen = new Set<string>();
	return values.flatMap((value, position) => {
		if (value === '') return [];
		if (seen.has(value)) return [position];
		seen.add(value);
		return [];
	});
}

/** An optional value as it is stored: one that says nothing is left out. */
function present<T>(value: T | null | undefined): T | undefined {
	return isAbsent(value) ? undefined : (value ?? undefined);
}

/**
 * A question as it is stored: without the keys that were left out, at every
 * depth. By now every optional value that says nothing is `undefined`.
 */
function compact<T>(value: T): T {
	if (Array.isArray(value)) return value.map(compact) as T;
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, inner]) => inner !== undefined)
			.map(([key, inner]) => [key, compact(inner)])
	) as T;
}

/**
 * The characters no text may hold, because the database cannot store them:
 * NUL, and half of a surrogate pair on its own.
 */
const UNSTORABLE = /[\0\p{Cs}]/u;

/** Whether the database can store a text. */
export const storable = (value: string) => !UNSTORABLE.test(value);

/** How long a text is, as a person and the database count it: an emoji is one character. */
export const chars = (value: string) => [...value].length;

/**
 * Text as it is stored: trimmed, of characters the database can hold, and no
 * longer than `max`. `missing` is what is said where there is no text at all.
 */
export function text(max: number, missing?: () => string) {
	return z
		.string(missing && { error: missing })
		.trim()
		.refine(storable, { error: () => m.item_text_unstorable() })
		.refine((value) => chars(value) <= max, { error: () => m.item_text_too_long({ max }) });
}

/** Text that must be there. */
const required = (message: () => string, max = MAX_ENTRY_CHARS) =>
	text(max, message).min(1, { error: message });

/** Text that may be left out: null and blank both mean it was. */
const optional = (max: number) => text(max).nullish().transform(present);

/** One entry of a list, which may be left blank where a picture stands for it. */
const entryText = text(MAX_ENTRY_CHARS);

/**
 * Words a person listed, such as accepted answers: trimmed, without blanks or
 * repeats. What is wrong with one of them is said of the list, which is where
 * a form shows it.
 */
const words = z
	.array(z.string())
	.transform((list) => [...new Set(list.map((word) => word.trim()).filter(Boolean))])
	.refine((list) => list.every(storable), { error: () => m.item_text_unstorable() })
	.refine((list) => list.every((word) => chars(word) <= MAX_ENTRY_CHARS), {
		error: () => m.item_text_too_long({ max: MAX_ENTRY_CHARS })
	})
	.refine((list) => list.length <= MAX_ENTRIES, {
		error: () => m.item_list_too_long({ max: MAX_ENTRIES })
	});

/** Words that may be left out: a list with nothing in it is. */
const optionalWords = words.optional().transform(present);

/** A switch: off is the key left out. */
const flag = z.boolean().optional().transform(present);

/** What points at an id. The editor makes both, so neither has words of its own when refused. */
const pointer = z.string().trim().max(MAX_ID_CHARS).refine(storable);
const id = pointer.min(1);

/** A list no longer than a question's lists may be. */
const tooMany = (max: number) => ({ error: () => m.item_list_too_long({ max }) });

/** A picture: where it is stored, or what stands for it until Save. */
const picture = optional(MAX_IMAGE_PATH_CHARS);

/** What every type carries. Cloze replaces `question`, Label a Picture `image_path`. */
const common = {
	question: required(() => m.item_question_required(), MAX_QUESTION_CHARS),
	image_path: picture,
	tip: optional(MAX_TIP_CHARS)
};

/** The two choice types carry their tips on their wrong options, and none of their own. */
const commonWithoutTip = { question: common.question, image_path: common.image_path };

/** Words, a picture, or both: an entry with neither shows the pupil nothing. */
const textOrPicture = (empty: () => string) =>
	rule<{ text: string; image_path?: string }>((value, refuse) => {
		if (!value.text && !value.image_path) refuse(['text'], empty());
	});

/** An item a pupil joins or puts in order. `empty` is what is said of one that shows nothing. */
const entryOf = (empty: () => string) =>
	z.object({ id, text: entryText, image_path: picture }).check(textOrPicture(empty));
const entry = entryOf(() => m.item_entry_empty());
/** The answer an item of a Matching is joined to. */
const answerEntry = entryOf(() => m.item_answer_empty());

/** The ids of a list are what its answer key points at, so no two may be the same. */
function uniqueIds(key: string, list: { id: string }[], refuse: Refuse) {
	for (const position of repeats(list.map((each) => each.id))) {
		refuse([key, position, 'id'], m.item_invalid());
	}
}

/**
 * Two entries that show the same words and the same picture cannot be told
 * apart by a pupil, so the later one is refused.
 */
function uniqueTexts(
	key: string,
	list: { text: string; image_path?: string }[],
	refuse: Refuse,
	repeated: () => string
) {
	const shown = list.map((each) =>
		each.image_path ? `${each.text}\n${each.image_path}` : each.text
	);
	for (const position of repeats(shown)) refuse([key, position, 'text'], repeated());
}

// ---- Multiple Choice, Multiple Response ------------------------------------

const choiceOptions = z
	.array(
		z
			.object({
				text: entryText,
				is_correct: z.boolean(),
				image_path: picture,
				tip: optional(MAX_TIP_CHARS)
			})
			.check(textOrPicture(() => m.item_option_empty()))
			// A tip is for a pupil who picks a wrong option, so a right one stores none.
			.transform((option) => (option.is_correct ? { ...option, tip: undefined } : option))
	)
	.min(2, { error: () => m.item_options_too_few() })
	.max(MAX_ENTRIES, tooMany(MAX_ENTRIES));

/** The checks the two choice types share, and how many right answers each asks for. */
const choiceRule = (enough: (correct: number) => boolean, message: () => string) =>
	rule<{ options: { text: string; image_path?: string; is_correct: boolean }[] }>(
		({ options }, refuse) => {
			uniqueTexts('options', options, refuse, () => m.item_option_repeated());
			if (!enough(options.filter((option) => option.is_correct).length)) {
				refuse(['options'], message());
			}
		}
	);

export const mcqSchema = z
	.object({ type: z.literal('mcq'), ...commonWithoutTip, options: choiceOptions })
	.check(
		choiceRule(
			(correct) => correct === 1,
			() => m.item_mcq_one_correct()
		)
	)
	.transform(compact);

/**
 * Two right answers at least: a question with one is a Multiple Choice, and
 * pupils are told how many to pick. And one wrong option at least: with none,
 * ticking everything is full marks.
 */
export const mrqSchema = z
	.object({ type: z.literal('mrq'), ...commonWithoutTip, options: choiceOptions })
	.check(
		choiceRule(
			(correct) => correct >= 2,
			() => m.item_mrq_two_correct()
		),
		rule(({ options }, refuse) => {
			if (options.length > 0 && options.every((option) => option.is_correct)) {
				refuse(['options'], m.item_mrq_all_correct());
			}
		})
	)
	.transform(compact);

// ---- True or False ---------------------------------------------------------

export const trueFalseSchema = z
	.object({
		type: z.literal('true_false'),
		...common,
		answer: z.boolean({ error: () => m.item_true_false_answer_required() }),
		labels: z.tuple([entryText, entryText]).nullish().transform(present)
	})
	.check(
		rule(({ labels }, refuse) => {
			if (!labels) return;
			labels.forEach((word, position) => {
				if (!word) refuse(['labels', position], m.item_true_false_words_required());
			});
			if (labels[0] && labels[0] === labels[1]) {
				refuse(['labels', 1], m.item_true_false_words_same());
			}
		})
	)
	.transform(compact);

// ---- Tick Table, Classify --------------------------------------------------

/**
 * The checks of the two types that sort entries into named groups: no two
 * groups or entries alike, and every entry in a group that exists.
 */
const sortingRule = (messages: {
	groupRepeated: () => string;
	entryRepeated: () => string;
	unplaced: () => string;
}) =>
	rule<{
		groups: { id: string; text: string }[];
		items: { id: string; text: string; image_path?: string; group_id: string }[];
	}>(({ groups, items }, refuse) => {
		uniqueIds('groups', groups, refuse);
		uniqueIds('items', items, refuse);
		uniqueTexts('groups', groups, refuse, messages.groupRepeated);
		uniqueTexts('items', items, refuse, messages.entryRepeated);
		items.forEach((item, position) => {
			if (!groups.some((group) => group.id === item.group_id)) {
				refuse(['items', position, 'group_id'], messages.unplaced());
			}
		});
	});

export const tickTableSchema = z
	.object({
		type: z.literal('tick_table'),
		...common,
		groups: z
			.array(z.object({ id, text: required(() => m.item_column_name_required()) }))
			.min(2, { error: () => m.item_columns_count() })
			.max(5, { error: () => m.item_columns_count() }),
		items: z
			.array(
				z.object({
					id,
					text: required(() => m.item_row_text_required()),
					group_id: pointer
				})
			)
			.min(1, { error: () => m.item_rows_required() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES))
	})
	.check(
		sortingRule({
			groupRepeated: () => m.item_column_repeated(),
			entryRepeated: () => m.item_row_repeated(),
			unplaced: () => m.item_row_column_required()
		})
	)
	.transform(compact);

export const classifySchema = z
	.object({
		type: z.literal('classify'),
		...common,
		groups: z
			.array(z.object({ id, text: required(() => m.item_group_name_required()) }))
			.min(2, { error: () => m.item_groups_count() })
			.max(4, { error: () => m.item_groups_count() }),
		items: z
			.array(
				z
					.object({
						id,
						text: entryText,
						image_path: picture,
						group_id: pointer
					})
					.check(textOrPicture(() => m.item_entry_empty()))
			)
			.min(2, { error: () => m.item_classify_too_few() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES))
	})
	.check(
		sortingRule({
			groupRepeated: () => m.item_group_repeated(),
			entryRepeated: () => m.item_entry_repeated(),
			unplaced: () => m.item_classify_group_required()
		})
	)
	.transform(compact);

// ---- Pick Words ------------------------------------------------------------

export const pickWordsSchema = z
	.object({
		type: z.literal('pick_words'),
		...common,
		// A word may appear twice in a sentence, so repeats are fine here.
		options: z
			.array(z.object({ text: entryText.min(1), is_correct: z.boolean() }))
			.min(2, { error: () => m.item_sentence_too_short() })
			.max(MAX_WORDS, tooMany(MAX_WORDS))
	})
	.check(
		rule(({ options }, refuse) => {
			if (!options.some((option) => option.is_correct)) {
				refuse(['options'], m.item_pick_words_none_correct());
			}
			// With every word an answer, tapping them all is full marks.
			else if (options.every((option) => option.is_correct)) {
				refuse(['options'], m.item_pick_words_all_correct());
			}
		})
	)
	.transform(compact);

// ---- Fill in the Blanks ----------------------------------------------------

export const clozeSchema = z
	.object({
		type: z.literal('cloze'),
		...common,
		// The text is what the pupil reads; a question above it is an optional lead-in.
		question: optional(MAX_QUESTION_CHARS),
		text: required(() => m.item_cloze_text_required(), MAX_QUESTION_CHARS),
		blanks: z
			.array(
				z.object({
					index: z.int().min(1),
					accepted: words.refine((list) => list.length > 0, {
						error: () => m.item_cloze_accepted_required()
					}),
					choices: optionalWords
				})
			)
			.min(1, { error: () => m.item_cloze_blanks_required() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES)),
		// A text with no mode is typed into, so that mode is not written down.
		mode: z
			.enum(CLOZE_MODES)
			.optional()
			.transform((mode) => (mode === 'typing' ? undefined : mode)),
		distractors: optionalWords,
		reuse: flag
	})
	.check(
		rule(({ text, blanks, mode, reuse }, refuse) => {
			for (const position of repeats(blanks.map((blank) => String(blank.index)))) {
				refuse(['blanks', position, 'index'], m.item_invalid());
			}

			// The text and the blanks must name the same blanks, each once.
			const placed = clozeSegments(text).flatMap((part) =>
				part.kind === 'blank' ? [part.index] : []
			);
			for (const position of repeats(placed.map(String))) {
				refuse(['text'], m.item_cloze_blank_repeated({ n: placed[position] }));
			}
			for (const n of new Set(placed)) {
				if (!blanks.some((blank) => blank.index === n)) {
					refuse(['text'], m.item_cloze_blank_unanswered({ n }));
				}
			}
			blanks.forEach((blank, position) => {
				if (!placed.includes(blank.index)) {
					refuse(['blanks', position], m.item_cloze_blank_unplaced({ n: blank.index }));
				}
			});

			if (mode === 'choices') {
				blanks.forEach(({ accepted, choices = [] }, position) => {
					const at = ['blanks', position, 'choices'];
					if (choices.length < 2 || choices.length > 4) refuse(at, m.item_cloze_choices_count());
					else if (accepted.length > 0 && !choices.includes(accepted[0])) {
						refuse(at, m.item_cloze_choices_answer());
					}
				});
			}

			// The bank holds each answer once, so two blanks with one answer need it twice.
			if (mode === 'bank' && !reuse) {
				const answers = blanks.flatMap((blank) => blank.accepted.slice(0, 1));
				if (repeats(answers).length > 0) refuse(['reuse'], m.item_cloze_reuse_required());
			}
		})
	)
	// Only the keys of the chosen way of answering are stored, so nothing left
	// over from another way can disagree with it later.
	.transform(({ blanks, distractors, reuse, ...rest }) => {
		const answers = blanks.map((blank) => blank.accepted[0]);
		const extra = distractors?.filter((word) => !answers.includes(word));
		return compact({
			...rest,
			blanks: blanks.map(({ choices, ...blank }) =>
				rest.mode === 'choices' ? { ...blank, choices } : blank
			),
			...(rest.mode === 'bank' ? { distractors: present(extra), reuse } : {})
		});
	});

// ---- Short Answer, Word Completion -----------------------------------------

export const shortAnswerSchema = z
	.object({
		type: z.literal('short_answer'),
		...common,
		accepted_answers: words.refine((list) => list.length > 0, {
			error: () => m.item_short_answer_required()
		})
	})
	.transform(compact);

export const wordCompletionSchema = z
	.object({
		type: z.literal('word_completion'),
		...common,
		// One word, a box a letter: 2 to 30 characters, and among them no space and no
		// control character, which is a space to the database.
		answer: z
			.string({ error: () => m.item_word_invalid() })
			.trim()
			.refine(
				(word) =>
					storable(word) && !/[\s\p{Cc}]/u.test(word) && chars(word) >= 2 && chars(word) <= 30,
				{ error: () => m.item_word_invalid() }
			),
		reveal_first: flag
	})
	.transform(compact);

// ---- Number ----------------------------------------------------------------

const numeric = { type: z.literal('numeric'), ...common };

/** An empty number box arrives as null or NaN; both are refused as "not a number". */
const answer = z.number({ error: () => m.item_number_required() });
const whole = z
	.int({ error: () => m.item_whole_number_required() })
	.min(0, { error: () => m.item_whole_number_required() });
const denominator = z
	.int({ error: () => m.item_denominator_invalid() })
	.min(1, { error: () => m.item_denominator_invalid() });

const numberSchema = z
	.object({
		...numeric,
		form: z.literal('number').optional(),
		answer,
		tolerance: z
			.number({ error: () => m.item_tolerance_invalid() })
			.min(0, { error: () => m.item_tolerance_invalid() })
			.nullish()
			.transform(present),
		unit: optional(MAX_UNIT_CHARS)
	})
	// A Number with no form is a plain number, so that form is not written down.
	.transform((number) => compact({ ...number, form: undefined }));

const moneySchema = z.object({ ...numeric, form: z.literal('money'), answer }).transform(compact);

const fractionSchema = z
	.object({
		...numeric,
		form: z.literal('fraction'),
		parts: z.tuple([whole, denominator]),
		equivalent: flag
	})
	.transform(compact);

const mixedSchema = z
	.object({
		...numeric,
		form: z.literal('mixed'),
		parts: z.tuple([whole, whole, denominator]),
		improper: flag,
		unit: optional(MAX_UNIT_CHARS)
	})
	.transform(compact);

const ratioSchema = z
	.object({
		...numeric,
		form: z.literal('ratio'),
		parts: z
			.array(whole)
			.min(2, { error: () => m.item_ratio_terms() })
			.max(3, { error: () => m.item_ratio_terms() })
			// The two checks above are what make the list one of the two tuples.
			.transform((terms) => terms as NumericRatioPayload['parts']),
		equivalent: flag
	})
	.transform(compact);

const timeSchema = z
	.object({
		...numeric,
		form: z.literal('time'),
		parts: z.tuple([whole, whole]),
		period: z.enum(['am', 'pm']).nullable()
	})
	.check(
		rule(({ parts: [hour, minute], period }, refuse) => {
			if (minute > 59) refuse(['parts', 1], m.item_minutes_invalid());
			if (period === null) {
				if (hour > 23) refuse(['parts', 0], m.item_hour_24_invalid());
			} else if (hour < 1 || hour > 12) {
				refuse(['parts', 0], m.item_hour_12_invalid());
			}
		})
	)
	.transform(compact);

const measureSchema = z
	.object({
		...numeric,
		form: z.literal('measure'),
		parts: z.tuple([whole, whole]),
		units: z.tuple([
			required(() => m.item_units_required(), MAX_UNIT_CHARS),
			required(() => m.item_units_required(), MAX_UNIT_CHARS)
		])
	})
	.transform(compact);

/** A Number question in any of its answer forms. One without `form` is a plain number. */
export const numericSchema = z.discriminatedUnion('form', [
	numberSchema,
	fractionSchema,
	mixedSchema,
	ratioSchema,
	moneySchema,
	timeSchema,
	measureSchema
]);

// ---- Matching --------------------------------------------------------------

export const matchingSchema = z
	.object({
		type: z.literal('matching'),
		...common,
		left: z
			.array(entry)
			.min(1, { error: () => m.item_pairs_required() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES)),
		right: z
			.array(answerEntry)
			.min(1, { error: () => m.item_pairs_required() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES)),
		pairs: z.array(z.object({ left_id: pointer, right_id: pointer })).max(MAX_ENTRIES)
	})
	.check(
		rule(({ left, right, pairs }, refuse) => {
			uniqueIds('left', left, refuse);
			uniqueIds('right', right, refuse);
			// One answer serves two items by being paired twice, not by being written twice.
			uniqueTexts('left', left, refuse, () => m.item_entry_repeated());
			uniqueTexts('right', right, refuse, () => m.item_answer_repeated());

			pairs.forEach((pair, position) => {
				if (!left.some((item) => item.id === pair.left_id)) {
					refuse(['pairs', position, 'left_id'], m.item_invalid());
				}
			});
			for (const position of repeats(pairs.map((pair) => pair.left_id))) {
				refuse(['pairs', position, 'left_id'], m.item_invalid());
			}
			left.forEach((item, position) => {
				const pair = pairs.find((candidate) => candidate.left_id === item.id);
				if (!right.some((answer) => answer.id === pair?.right_id)) {
					refuse(['left', position], m.item_pair_required());
				}
			});
		})
	)
	.transform(compact);

// ---- Ordering, Sentence Rearrangement --------------------------------------

/** `correct_order` names every item once: it is the items' ids in the right order. */
const orderRule = rule<{ items: { id: string }[]; correct_order: string[] }>(
	({ items, correct_order }, refuse) => {
		uniqueIds('items', items, refuse);
		const ids = new Set(items.map((item) => item.id));
		const named = new Set(correct_order);
		if (
			correct_order.length !== ids.size ||
			named.size !== ids.size ||
			!correct_order.every((each) => ids.has(each))
		) {
			refuse(['correct_order'], m.item_invalid());
		}
	}
);

export const orderingSchema = z
	.object({
		type: z.literal('ordering'),
		...common,
		items: z
			.array(entry)
			.min(2, { error: () => m.item_ordering_too_few() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES)),
		correct_order: z.array(pointer).max(MAX_ENTRIES)
	})
	.check(
		orderRule,
		rule(({ items }, refuse) => uniqueTexts('items', items, refuse, () => m.item_entry_repeated()))
	)
	.transform(compact);

export const rearrangeSchema = z
	.object({
		type: z.literal('rearrange'),
		...common,
		// A sentence may use a word twice, so two chips may read the same.
		items: z
			.array(z.object({ id, text: entryText.min(1) }))
			.min(2, { error: () => m.item_sentence_too_short() })
			.max(MAX_WORDS, tooMany(MAX_WORDS)),
		correct_order: z.array(pointer).max(MAX_WORDS)
	})
	.check(orderRule)
	.transform(compact);

// ---- Label a Picture -------------------------------------------------------

const percent = z.number().min(0).max(100);

export const labelPictureSchema = z
	.object({
		type: z.literal('label_picture'),
		...common,
		image_path: required(() => m.item_picture_required(), MAX_IMAGE_PATH_CHARS),
		// Two parts of a picture may share a name, so two labels may read the same.
		labels: z
			.array(
				z.object({
					id,
					text: required(() => m.item_label_text_required()),
					x: percent,
					y: percent
				})
			)
			.min(1, { error: () => m.item_labels_required() })
			.max(MAX_ENTRIES, tooMany(MAX_ENTRIES)),
		mode: z.enum(LABEL_MODES),
		distractors: optionalWords
	})
	.check(rule(({ labels }, refuse) => uniqueIds('labels', labels, refuse)))
	.transform(({ distractors, ...rest }) => {
		const extra =
			rest.mode === 'bank'
				? distractors?.filter((word) => !rest.labels.some((label) => label.text === word))
				: undefined;
		return compact({ ...rest, distractors: present(extra) });
	});

// ---- Every type ------------------------------------------------------------

export const itemPayloadSchema = z.discriminatedUnion('type', [
	mcqSchema,
	mrqSchema,
	trueFalseSchema,
	tickTableSchema,
	pickWordsSchema,
	clozeSchema,
	shortAnswerSchema,
	wordCompletionSchema,
	numericSchema,
	matchingSchema,
	orderingSchema,
	rearrangeSchema,
	classifySchema,
	labelPictureSchema
]) satisfies z.ZodType<ItemPayload>;

/**
 * Checks a question and tidies it for storing. Every refusal is in words for
 * the person writing the question. Where no rule of ours has words for it (a
 * key of the wrong kind, an id that points nowhere), the payload was not built
 * by the editor, and the person is told only that it could not be read.
 */
export function validateItem(
	payload: unknown
): { ok: true; payload: ItemPayload } | { ok: false; issues: ItemIssue[] } {
	const parsed = itemPayloadSchema.safeParse(payload, { error: () => m.item_invalid() });
	if (parsed.success) return { ok: true, payload: parsed.data };
	return {
		ok: false,
		issues: parsed.error.issues.map(({ path, message }) => ({
			// A payload is JSON, so no key of it is a symbol.
			path: path.filter((key) => typeof key !== 'symbol'),
			message
		}))
	};
}

/** What is wrong at one key, if anything: the first refusal there, for a form to show beside the field. */
export function issueAt(issues: ItemIssue[], ...path: Path): string | undefined {
	return issues.find(
		(issue) =>
			issue.path.length === path.length && issue.path.every((key, depth) => key === path[depth])
	)?.message;
}
