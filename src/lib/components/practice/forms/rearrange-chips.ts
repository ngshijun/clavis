import { newId } from '#lib/items/kinds.js';
import type { RearrangePayload } from '#lib/items/payload.js';
import { chipsToSentence, sentenceToChips } from '#lib/items/text.js';

/** One chip of a Sentence Rearrangement: a word, a phrase, or the closing mark. */
export type Chip = RearrangePayload['items'][number];

/**
 * The chips of a sentence that was typed again. It is cut afresh, and then
 * every stretch of it that reads as a chip the admin had joined by hand is
 * joined again, so correcting one word does not undo the phrases.
 *
 * A chip that reads as before keeps its id, and a chip being spelled keeps the
 * id of the one it replaces: the pupil view orders the chips by their ids, and
 * must not jump about at every keystroke.
 */
export function recut(sentence: string, before: Chip[]): Chip[] {
	const words = sentenceToChips(sentence);
	const known = new Set(before.map((chip) => chip.text));
	const longest = Math.max(0, ...before.map((chip) => chip.text.length));

	const texts: string[] = [];
	for (let at = 0; at < words.length;) {
		let text = words[at];
		let taken = 1;
		// The longest run of words from here that spells a chip there was before.
		let run = words[at];
		for (let to = at + 1; to < words.length; to++) {
			run = chipsToSentence([run, words[to]]);
			if (run.length > longest) break;
			if (known.has(run)) {
				text = run;
				taken = to - at + 1;
			}
		}
		texts.push(text);
		at += taken;
	}

	const free = [...before];
	const chips = texts.map((text) => {
		const at = free.findIndex((chip) => chip.text === text);
		return { id: at === -1 ? '' : free.splice(at, 1)[0].id, text };
	});
	for (const chip of chips) chip.id ||= free.shift()?.id ?? newId();
	return chips;
}

/** Joins the chip at `at` and the one after it into one, which keeps the first one's id. */
export function joinChips(chips: Chip[], at: number): Chip[] {
	const [first, second] = [chips[at], chips[at + 1]];
	const joined = { id: first.id, text: chipsToSentence([first.text, second.text]) };
	return [...chips.slice(0, at), joined, ...chips.slice(at + 2)];
}

/** A place a chip can be cut at, and the two chips the cut would leave. */
export type Cut = { at: number; head: string; tail: string };

const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Every place a chip can be cut at: between any two of its letters, as long
 * as both sides have something left. Either side of a space is the same cut,
 * which is offered once.
 */
export function cutsOf(text: string): Cut[] {
	const cuts: Cut[] = [];
	for (const { index } of letters.segment(text)) {
		const head = text.slice(0, index).trim();
		const tail = text.slice(index).trim();
		if (head && tail && cuts.at(-1)?.head !== head) cuts.push({ at: index, head, tail });
	}
	return cuts;
}

/** Cuts the chip at `at` in two. The first half keeps the id. */
export function splitChip(chips: Chip[], at: number, cut: Cut): Chip[] {
	return [
		...chips.slice(0, at),
		{ id: chips[at].id, text: cut.head },
		{ id: newId(), text: cut.tail },
		...chips.slice(at + 1)
	];
}
