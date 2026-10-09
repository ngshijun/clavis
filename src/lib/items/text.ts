import type { ClozeBlank, ItemPayload } from './payload.js';

/**
 * Text helpers the forms, the import and the previews share. They only cut and
 * join strings: ids are given to the pieces by whoever stores them.
 */

/** A cloze text and its blanks, as the payload keeps them. */
export type ClozeText = { text: string; blanks: ClozeBlank[] };

export type ClozeSegment = { kind: 'text'; text: string } | { kind: 'blank'; index: number };

/** `{{n}}`: where blank `n` goes in a cloze text. */
const PLACEHOLDER = /\{\{(\d+)\}\}/g;

/** A cloze text cut into what is read and where the blanks are, in reading order. */
export function clozeSegments(text: string): ClozeSegment[] {
	// Splitting on a pattern with a group keeps the group: the pieces alternate text, index, text.
	return text
		.split(PLACEHOLDER)
		.flatMap((piece, position): ClozeSegment[] =>
			position % 2 === 1
				? [{ kind: 'blank', index: Number(piece) }]
				: piece
					? [{ kind: 'text', text: piece }]
					: []
		);
}

/**
 * Reads a text written with each blank's answers in square brackets, as a
 * spreadsheet row or a person typing writes it: `The [roots|root] take in water.`
 */
export function clozeFromBrackets(source: string): ClozeText {
	const blanks: ClozeBlank[] = [];
	const text = source.replace(/\[([^[\]]*)\]/g, (_, answers: string) => {
		const index = blanks.length + 1;
		const accepted = answers
			.split('|')
			.map((answer) => answer.trim())
			.filter(Boolean);
		blanks.push({ index, accepted });
		return `{{${index}}}`;
	});
	return { text, blanks };
}

/** A sentence cut at its spaces for Pick Words. Punctuation stays on its word. */
export function sentenceToWords(sentence: string): string[] {
	return sentence.split(/\s+/).filter(Boolean);
}

export function wordsToSentence(words: string[]): string {
	return words.join(' ');
}

/** The marks that end a sentence, in the languages the questions are written in. */
const SENTENCE_MARKS = '.!?。！？';
const ONLY_MARKS = new RegExp(`^[${SENTENCE_MARKS}]+$`);
const TRAILING_MARKS = new RegExp(`^(.*?)([${SENTENCE_MARKS}]+)$`, 's');

/** Chinese characters, and the punctuation written with them: no space goes between two. */
const HAN = /\p{Script=Han}/u;
const CJK = '\\p{Script=Han}。！？，、；：“”‘’（）《》';
const ENDS_IN_CJK = new RegExp(`[${CJK}]$`, 'u');
const STARTS_IN_CJK = new RegExp(`^[${CJK}]`, 'u');

/**
 * A sentence cut into the chips of a Sentence Rearrangement. It is cut at its
 * spaces, and the mark that ends it becomes a chip of its own. Chinese written
 * without spaces has nowhere to cut, so each character is a chip; the admin
 * joins chips into words afterwards, or writes the sentence with a space
 * between words to begin with.
 */
export function sentenceToChips(sentence: string): string[] {
	const trimmed = sentence.trim();
	if (!/\s/.test(trimmed) && HAN.test(trimmed)) return Array.from(trimmed);

	const words = sentenceToWords(trimmed);
	const last = words.pop();
	if (last === undefined) return [];
	const [, word, marks] = TRAILING_MARKS.exec(last) ?? [];
	if (!marks) return [...words, last];
	return word ? [...words, word, marks] : [...words, marks];
}

/**
 * Chips joined back into the sentence they spell. A space goes between two
 * chips, except before the closing mark and inside Chinese text.
 */
export function chipsToSentence(chips: string[]): string {
	return chips.reduce((sentence, chip) => {
		if (!sentence) return chip;
		const joined =
			ONLY_MARKS.test(chip) || (ENDS_IN_CJK.test(sentence) && STARTS_IN_CJK.test(chip));
		return sentence + (joined ? '' : ' ') + chip;
	}, '');
}

/**
 * The one line a list row shows for a question: the question itself, or for a
 * fill-in-the-blanks with no lead-in, its text with a rule where each blank is.
 */
export function itemSummary(payload: ItemPayload): string {
	const question = oneLine(payload.question ?? '');
	if (question || payload.type !== 'cloze') return question;
	return oneLine(payload.text.replace(PLACEHOLDER, '____'));
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
