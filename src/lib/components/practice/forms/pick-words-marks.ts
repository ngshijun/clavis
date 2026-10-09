import type { PickWordsPayload } from '#lib/items/payload.js';

type Word = PickWordsPayload['options'][number];

/**
 * The words of a Pick Words sentence after it was edited, each with the mark
 * it had before. An edit changes one stretch of the sentence, so the words in
 * front of that stretch and the words behind it are the ones that were there
 * already: they keep their marks, wherever they now stand. A word typed in is
 * not an answer until it is tapped.
 */
export function carryMarks(before: Word[], words: string[]): Word[] {
	const most = Math.min(before.length, words.length);
	let head = 0;
	while (head < most && before[head].text === words[head]) head++;
	let tail = 0;
	while (
		tail < most - head &&
		before[before.length - 1 - tail].text === words[words.length - 1 - tail]
	) {
		tail++;
	}

	// One word standing where one word stood is that word being spelled again, letter by
	// letter: it must not lose its mark at the first keystroke.
	const respelled = before.length - head - tail === 1 && words.length - head - tail === 1;

	return words.map((text, at) => {
		const fromEnd = words.length - 1 - at;
		if (at < head) return { text, is_correct: before[at].is_correct };
		if (fromEnd < tail) return { text, is_correct: before[before.length - 1 - fromEnd].is_correct };
		return { text, is_correct: respelled && before[head].is_correct };
	});
}
