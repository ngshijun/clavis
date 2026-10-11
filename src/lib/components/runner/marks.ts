import type { MarkedQuestion } from '#lib/items/run.js';

/** How a question was marked, as a pupil is told it. */
export type Mark = 'right' | 'part' | 'wrong' | 'none';

/** How one part of an answer was marked. */
export type Verdict = 'right' | 'wrong';

/** What an answer area is told of how its answer was marked, to show it on the answer. */
export type AnswerMark = Pick<MarkedQuestion, 'correct' | 'total' | 'right'>;

/** How a question was marked. One the pupil put nothing into is not wrong: it was left out. */
export function markOf(marked: MarkedQuestion, answered: boolean): Mark {
	if (!answered) return 'none';
	if (marked.total > 0 && marked.correct === marked.total) return 'right';
	return marked.correct > 0 ? 'part' : 'wrong';
}

/** The verdict on an answer of one part: the whole of it is right or it is wrong. */
export function wholeVerdict(mark: AnswerMark | undefined): Verdict | undefined {
	if (!mark) return undefined;
	return mark.total > 0 && mark.correct === mark.total ? 'right' : 'wrong';
}

/** The verdict on one part of an answer, by what the answer names the part by. */
export function partVerdict(
	mark: AnswerMark | undefined,
	key: string | number
): Verdict | undefined {
	if (!mark) return undefined;
	return mark.right.includes(String(key)) ? 'right' : 'wrong';
}
