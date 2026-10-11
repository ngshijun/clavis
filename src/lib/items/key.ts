/**
 * The answer key of a question, read out of its payload as an answer: what a
 * pupil would have to give to earn the whole mark. It is for a reader who
 * may see the right answer, which a pupil may not, so it is worked out on
 * the server and only ever sent to staff.
 *
 * Nothing here marks anything: that is the grader's alone
 * (`app.grade_item_response`). Where a question accepts several answers,
 * the key is the first of them.
 */
import type { ItemPayload } from './payload.js';
import type { ItemResponse } from './served.js';

export interface AnswerKey {
	/** The right answer, in the shape a pupil's answer has. */
	answer: ItemResponse;
	/**
	 * Every part of it, each by what an answer names it by (an option's
	 * number, a blank's index, a pair's `left_id`, or an id), so that it can
	 * be drawn as an answer got wholly right. Empty for a question of one part.
	 */
	parts: string[];
}

/** The numbers of the options that are right: an option is numbered by its place, from 1. */
const rightOptions = (options: { is_correct: boolean }[]) =>
	options.flatMap((option, at) => (option.is_correct ? [at + 1] : []));

export function keyOf(payload: ItemPayload): AnswerKey {
	switch (payload.type) {
		case 'mcq':
			return { answer: { selected_options: rightOptions(payload.options) }, parts: [] };
		case 'mrq':
		case 'pick_words': {
			const picks = rightOptions(payload.options);
			return { answer: { selected_options: picks }, parts: picks.map(String) };
		}
		case 'true_false':
			return { answer: { response: { value: payload.answer } }, parts: [] };
		case 'tick_table':
		case 'classify':
			return {
				answer: {
					response: { items: payload.items.map(({ id, group_id }) => ({ id, group_id })) }
				},
				parts: payload.items.map((item) => item.id)
			};
		case 'cloze':
			return {
				answer: {
					response: {
						blanks: payload.blanks.map(({ index, accepted }) => ({
							index,
							value: accepted[0] ?? ''
						}))
					}
				},
				parts: payload.blanks.map((blank) => String(blank.index))
			};
		case 'short_answer':
			return { answer: { text_answer: payload.accepted_answers[0] ?? '' }, parts: [] };
		case 'word_completion':
			// The boxes take the word's letters and none of its spaces.
			return { answer: { text_answer: payload.answer.replace(/\s/g, '') }, parts: [] };
		case 'numeric':
			// A number and an amount of money are typed as one line; money to the sen.
			if ('answer' in payload) {
				const typed = payload.form === 'money' ? payload.answer.toFixed(2) : String(payload.answer);
				return { answer: { text_answer: typed }, parts: [] };
			}
			return {
				answer: {
					response: {
						parts: [...payload.parts],
						...(payload.form === 'time' ? { period: payload.period } : {})
					}
				},
				parts: []
			};
		case 'matching':
			return {
				answer: {
					response: {
						pairs: payload.pairs.map(({ left_id, right_id }) => ({ left_id, right_id }))
					}
				},
				parts: payload.pairs.map((pair) => pair.left_id)
			};
		case 'ordering':
			return {
				answer: { response: { order: [...payload.correct_order] } },
				parts: [...payload.correct_order]
			};
		case 'rearrange':
			return { answer: { response: { order: [...payload.correct_order] } }, parts: [] };
		case 'label_picture':
			return {
				answer: {
					response: { labels: payload.labels.map(({ id, text }) => ({ id, value: text })) }
				},
				parts: payload.labels.map((label) => label.id)
			};
	}
}
