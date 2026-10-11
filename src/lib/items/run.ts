/**
 * A run: one stage dealt out for a pupil to answer from start to finish, and
 * what comes back when every answer has been marked.
 */
import type { ItemResponse, ServedItem } from './served.js';

export interface RunQuestion {
	id: string;
	/** The question's place as the pupil meets it, from 1, counted across passages. */
	number: number;
	item: ServedItem;
}

export interface RunPassage {
	id: string;
	title: string;
	body: string;
	image_path: string | null;
	/** Never empty: a passage with no question is not dealt. */
	questions: RunQuestion[];
}

export type RunEntry = ({ kind: 'question' } & RunQuestion) | ({ kind: 'passage' } & RunPassage);

export interface Run {
	stage: { id: string; name: string; question_order: 'fixed' | 'random' };
	/** How many questions there are. */
	total: number;
	/** The stage in the order it is met. */
	entries: RunEntry[];
}

/**
 * One question after marking. What comes back is the mark, which parts of the
 * pupil's own answer were right, and the tips, never the right answer: a
 * pupil is not shown the answer to a question got wrong.
 */
export interface MarkedQuestion {
	question_id: string;
	/** How many of the question's parts were right, and how many it has. */
	correct: number;
	total: number;
	/**
	 * The parts that were right, each by what the answer names it by: an
	 * option's number, a blank's index, a pair's `left_id`, or an id. Empty
	 * for a question of one part, which is right when `correct` is `total`.
	 */
	right: string[];
	/** The share of the question's one mark that was earned, 0 to 1. */
	marks: number;
	/** What the pupil is told about an answer short of the whole mark; none for a right one. */
	tips: string[];
}

export interface Marked {
	/** The sum of the questions' marks. */
	marks: number;
	/** How many questions there are, at one mark each. */
	total: number;
	questions: MarkedQuestion[];
}

/** A mark with at most two decimals and no noughts trailing: 13.17, 0.5, 26. */
export function markFigure(marks: number): string {
	return String(Math.round(marks * 100) / 100);
}

/** A pupil's answers, by the id of the question each one answers. */
export type Answers = Record<string, ItemResponse>;

/** One question of a run, with the passage it is on. */
export interface RunStep {
	question: RunQuestion;
	passage: RunPassage | null;
}

/** A run's questions one after another, in the order they are met. */
export function stepsOf(run: Run): RunStep[] {
	return run.entries.flatMap((entry): RunStep[] =>
		entry.kind === 'question'
			? [{ question: entry, passage: null }]
			: entry.questions.map((question) => ({ question, passage: entry }))
	);
}
