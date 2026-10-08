import { m } from '#lib/paraglide/messages.js';
import type {
	ClozeMode,
	Difficulty,
	Item,
	ItemPayload,
	ItemType,
	NumericForm,
	NumericPayload
} from './payload.js';

/** A new id for an option, an item or a group: random, so it gives no answer away. */
export function newId(): string {
	return crypto.randomUUID().slice(0, 8);
}

/** The headings the types are listed under, in the order the builder shows them. */
export const KIND_GROUPS = ['choose', 'fill_in', 'arrange', 'picture'] as const;
export type KindGroup = (typeof KIND_GROUPS)[number];

export const KIND_GROUP_LABELS: Record<KindGroup, () => string> = {
	choose: () => m.item_group_choose(),
	fill_in: () => m.item_group_fill_in(),
	arrange: () => m.item_group_arrange(),
	picture: () => m.item_group_picture()
};

export const DIFFICULTY_LABELS: Record<Difficulty, () => string> = {
	low: () => m.item_difficulty_low(),
	medium: () => m.item_difficulty_medium(),
	high: () => m.item_difficulty_high()
};

export const NUMERIC_FORM_LABELS: Record<NumericForm, () => string> = {
	number: () => m.item_form_number(),
	fraction: () => m.item_form_fraction(),
	mixed: () => m.item_form_mixed(),
	ratio: () => m.item_form_ratio(),
	money: () => m.item_form_money(),
	time: () => m.item_form_time(),
	measure: () => m.item_form_measure()
};

/** Label a Picture offers the first two of these, under the same names. */
export const CLOZE_MODE_LABELS: Record<ClozeMode, () => string> = {
	typing: () => m.item_mode_typing(),
	bank: () => m.item_mode_bank(),
	choices: () => m.item_mode_choices()
};

export interface ItemKind {
	group: KindGroup;
	label: () => string;
	/** What the type is for, in a line: shown where a type is picked. */
	blurb: () => string;
	/** How an answer is marked, in a line: shown under the form. */
	marking: () => string;
	/**
	 * A fresh question of the type, as the editor first shows it. It is not
	 * complete, so it does not pass the schema yet, and it holds no words in
	 * any language. A list that the editor fills row by row starts with empty
	 * rows; one that is made from a sentence, a picture or chips starts empty.
	 */
	blank: () => ItemPayload;
}

const emptyItem = (): Item => ({ id: newId(), text: '' });
const emptyOptions = () => Array.from({ length: 4 }, () => ({ text: '', is_correct: false }));

/**
 * A fresh Number question in one answer form. A number not entered yet is NaN:
 * it is still a number to TypeScript, a number box shows it as empty, and it
 * does not survive the schema (nor JSON, which writes it as null).
 */
export function blankNumeric(form: NumericForm): NumericPayload {
	const base = { type: 'numeric', question: '' } as const;
	switch (form) {
		case 'number':
			// A plain number is the form a Number has when it names none.
			return { ...base, answer: NaN };
		case 'money':
			return { ...base, form, answer: NaN };
		case 'fraction':
		case 'ratio':
			return { ...base, form, parts: [NaN, NaN] };
		case 'mixed':
			return { ...base, form, parts: [NaN, NaN, NaN] };
		case 'time':
			return { ...base, form, parts: [NaN, NaN], period: 'am' };
		case 'measure':
			return { ...base, form, parts: [NaN, NaN], units: ['', ''] };
	}
}

export const ITEM_KINDS: Record<ItemType, ItemKind> = {
	mcq: {
		group: 'choose',
		label: () => m.item_type_mcq(),
		blurb: () => m.item_blurb_mcq(),
		marking: () => m.item_marking_right_or_wrong(),
		blank: () => ({ type: 'mcq', question: '', options: emptyOptions() })
	},
	mrq: {
		group: 'choose',
		label: () => m.item_type_mrq(),
		blurb: () => m.item_blurb_mrq(),
		marking: () => m.item_marking_mrq(),
		blank: () => ({ type: 'mrq', question: '', options: emptyOptions() })
	},
	true_false: {
		group: 'choose',
		label: () => m.item_type_true_false(),
		blurb: () => m.item_blurb_true_false(),
		marking: () => m.item_marking_right_or_wrong(),
		blank: () => ({ type: 'true_false', question: '', answer: true })
	},
	tick_table: {
		group: 'choose',
		label: () => m.item_type_tick_table(),
		blurb: () => m.item_blurb_tick_table(),
		marking: () => m.item_marking_tick_table(),
		blank: () => ({
			type: 'tick_table',
			question: '',
			groups: [emptyItem(), emptyItem()],
			// No column is right for the row until the admin chooses one.
			items: [{ ...emptyItem(), group_id: '' }]
		})
	},
	pick_words: {
		group: 'choose',
		label: () => m.item_type_pick_words(),
		blurb: () => m.item_blurb_pick_words(),
		marking: () => m.item_marking_pick_words(),
		blank: () => ({ type: 'pick_words', question: '', options: [] })
	},
	cloze: {
		group: 'fill_in',
		label: () => m.item_type_cloze(),
		blurb: () => m.item_blurb_cloze(),
		marking: () => m.item_marking_cloze(),
		blank: () => ({ type: 'cloze', question: '', text: '', blanks: [] })
	},
	short_answer: {
		group: 'fill_in',
		label: () => m.item_type_short_answer(),
		blurb: () => m.item_blurb_short_answer(),
		marking: () => m.item_marking_right_or_wrong(),
		blank: () => ({ type: 'short_answer', question: '', accepted_answers: [] })
	},
	word_completion: {
		group: 'fill_in',
		label: () => m.item_type_word_completion(),
		blurb: () => m.item_blurb_word_completion(),
		marking: () => m.item_marking_right_or_wrong(),
		blank: () => ({ type: 'word_completion', question: '', answer: '' })
	},
	numeric: {
		group: 'fill_in',
		label: () => m.item_type_numeric(),
		blurb: () => m.item_blurb_numeric(),
		marking: () => m.item_marking_numeric(),
		blank: () => blankNumeric('number')
	},
	matching: {
		group: 'arrange',
		label: () => m.item_type_matching(),
		blurb: () => m.item_blurb_matching(),
		marking: () => m.item_marking_matching(),
		blank: () => {
			const left = [emptyItem(), emptyItem()];
			const right = [emptyItem(), emptyItem()];
			const pairs = left.map((item, row) => ({ left_id: item.id, right_id: right[row].id }));
			return { type: 'matching', question: '', left, right, pairs };
		}
	},
	ordering: {
		group: 'arrange',
		label: () => m.item_type_ordering(),
		blurb: () => m.item_blurb_ordering(),
		marking: () => m.item_marking_ordering(),
		blank: () => {
			const items = [emptyItem(), emptyItem()];
			return { type: 'ordering', question: '', items, correct_order: items.map(({ id }) => id) };
		}
	},
	rearrange: {
		group: 'arrange',
		label: () => m.item_type_rearrange(),
		blurb: () => m.item_blurb_rearrange(),
		marking: () => m.item_marking_rearrange(),
		blank: () => ({ type: 'rearrange', question: '', items: [], correct_order: [] })
	},
	classify: {
		group: 'arrange',
		label: () => m.item_type_classify(),
		blurb: () => m.item_blurb_classify(),
		marking: () => m.item_marking_classify(),
		blank: () => ({
			type: 'classify',
			question: '',
			groups: [emptyItem(), emptyItem()],
			items: []
		})
	},
	label_picture: {
		group: 'picture',
		label: () => m.item_type_label_picture(),
		blurb: () => m.item_blurb_label_picture(),
		marking: () => m.item_marking_label_picture(),
		// The picture is missing until the admin adds one, which the schema then asks for.
		blank: () => ({ type: 'label_picture', question: '', image_path: '', labels: [], mode: 'bank' })
	}
};

/**
 * Whether a question of the type has a tip of its own. The two choice types
 * have none: their tips sit on their wrong options instead.
 */
export function hasTip(type: ItemType): boolean {
	return type !== 'mcq' && type !== 'mrq';
}

/**
 * A fresh question of another type that keeps what every type has: the
 * question, its picture and, where the new type has one, its tip. This is the
 * editor's type switch; the type's own keys start blank.
 */
export function blankOf(
	type: ItemType,
	keep: Pick<ItemPayload, 'question' | 'image_path' | 'tip'>
): ItemPayload {
	return {
		...ITEM_KINDS[type].blank(),
		question: keep.question ?? '',
		...(keep.image_path ? { image_path: keep.image_path } : {}),
		...(keep.tip && hasTip(type) ? { tip: keep.tip } : {})
	};
}
