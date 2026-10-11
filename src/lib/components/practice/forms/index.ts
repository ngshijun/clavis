import type { Component } from 'svelte';
import type { ItemPayload, ItemType } from '#lib/items/payload.js';
import ChoiceForm from './choice-form.svelte';
import ClassifyForm from './classify-form.svelte';
import ClozeForm from './cloze-form.svelte';
import LabelPictureForm from './label-picture-form.svelte';
import MatchingForm from './matching-form.svelte';
import NumericForm from './numeric-form.svelte';
import OrderingForm from './ordering-form.svelte';
import PickWordsForm from './pick-words-form.svelte';
import RearrangeForm from './rearrange-form.svelte';
import ShortAnswerForm from './short-answer-form.svelte';
import TickTableForm from './tick-table-form.svelte';
import TrueFalseForm from './true-false-form.svelte';
import WordCompletionForm from './word-completion-form.svelte';

/**
 * A type's form: the part of the editor that is the type's own. It edits the
 * draft's payload in place through `bind:payload`. The editor draws what every
 * type has (the question, its picture, the tip) around it.
 */
export type ItemForm<Type extends ItemType = ItemType> = Component<
	{ payload: Extract<ItemPayload, { type: Type }> },
	object,
	'payload'
>;

/** The form of each type. Multiple Choice and Multiple Response share one. */
export const FORMS: { [Type in ItemType]: ItemForm<Type> } = {
	mcq: ChoiceForm,
	mrq: ChoiceForm,
	true_false: TrueFalseForm,
	tick_table: TickTableForm,
	pick_words: PickWordsForm,
	cloze: ClozeForm,
	short_answer: ShortAnswerForm,
	word_completion: WordCompletionForm,
	numeric: NumericForm,
	matching: MatchingForm,
	ordering: OrderingForm,
	rearrange: RearrangeForm,
	classify: ClassifyForm,
	label_picture: LabelPictureForm
};

/**
 * The form to draw for a draft of `type`. The editor holds the draft as any
 * type's payload and the form takes its own type's: the record above is what
 * keeps the two matched, which the compiler cannot follow through a lookup.
 */
export function formOf(type: ItemType): ItemForm {
	return FORMS[type] as unknown as ItemForm;
}
