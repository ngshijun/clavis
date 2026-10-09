import type { Component } from 'svelte';
import type { ItemType } from '#lib/items/payload.js';
import type { ItemResponse, ServedItem, ServedOf } from '#lib/items/served.js';
import type { AnswerMark } from '../marks.js';
import ChoiceAnswer from './choice-answer.svelte';
import ClassifyAnswer from './classify-answer.svelte';
import ClozeAnswer from './cloze-answer.svelte';
import LabelPictureAnswer from './label-picture-answer.svelte';
import MatchingAnswer from './matching-answer.svelte';
import NumericAnswer from './numeric-answer.svelte';
import OrderingAnswer from './ordering-answer.svelte';
import PickWordsAnswer from './pick-words-answer.svelte';
import RearrangeAnswer from './rearrange-answer.svelte';
import TextAnswer from './text-answer.svelte';
import TickTableAnswer from './tick-table-answer.svelte';
import TrueFalseAnswer from './true-false-answer.svelte';
import WordCompletionAnswer from './word-completion-answer.svelte';

/**
 * A type's answer area: what a pupil gets under the question and answers in.
 * It binds the answer; read-only it shows one that was given, and with a
 * mark, how that one was marked.
 */
export type ItemAnswer<Item extends ServedItem = ServedItem> = Component<
	{ item: Item; answer: ItemResponse; readonly?: boolean; mark?: AnswerMark },
	object,
	'answer'
>;

/** The answer area of each type. Multiple Choice and Multiple Response share one. */
const ANSWERS: { [Type in ItemType]: ItemAnswer<ServedOf<Type>> } = {
	mcq: ChoiceAnswer,
	mrq: ChoiceAnswer,
	true_false: TrueFalseAnswer,
	tick_table: TickTableAnswer,
	pick_words: PickWordsAnswer,
	cloze: ClozeAnswer,
	short_answer: TextAnswer,
	word_completion: WordCompletionAnswer,
	numeric: NumericAnswer,
	matching: MatchingAnswer,
	ordering: OrderingAnswer,
	rearrange: RearrangeAnswer,
	classify: ClassifyAnswer,
	label_picture: LabelPictureAnswer
};

/** The answer area to draw for an item of `type`. */
export function answerOf(type: ItemType): ItemAnswer {
	return ANSWERS[type] as unknown as ItemAnswer;
}
