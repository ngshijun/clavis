import type { ClozeBlank, ClozeMode } from '#lib/items/payload.js';
import { clozeSegments, type ClozeText } from '#lib/items/text.js';

/**
 * The Text field of a Fill in the Blanks form holds the text as it reads when
 * every blank is filled in, and marks the stretches of it that are blanks. A
 * blank is therefore a place in the written text, and these helpers keep the
 * marks where they belong while the text is typed in, cut and pasted over.
 */

/** A stretch of the written text, from `start` up to but not including `end`. */
export interface Span {
	start: number;
	end: number;
}

/** A blank: the stretch of the text that is its answer, and what else belongs to it. */
export interface Mark extends Span {
	/** The other spellings accepted for the blank, beside the one in the text. */
	others: string[];
	/** The wrong choices offered at the blank, when pupils answer by choosing. */
	wrong: string[];
}

/** One change of the text: the characters of a stretch gave way to `inserted` new ones. */
export interface Edit extends Span {
	inserted: number;
}

/** A stored text with its blanks, written out whole and marked. */
export function unfold({ text, blanks }: ClozeText): { source: string; marks: Mark[] } {
	let source = '';
	const marks: Mark[] = [];
	for (const part of clozeSegments(text)) {
		if (part.kind === 'text') {
			source += part.text;
			continue;
		}
		const blank = blanks.find((candidate) => candidate.index === part.index);
		const answer = blank?.accepted[0];
		// A placeholder with no answer has nothing to write out, so there is nothing to mark.
		if (!blank || !answer) continue;
		marks.push({
			start: source.length,
			end: source.length + answer.length,
			others: blank.accepted.slice(1),
			wrong: (blank.choices ?? []).filter((choice) => choice !== answer)
		});
		source += answer;
	}
	return { source, marks };
}

/**
 * The inverse of `unfold`: the text with `{{n}}` where each mark is, and the
 * blanks numbered 1 to n in reading order. The marked words are each blank's
 * first answer, and the first of its choices. A space at either end of a mark
 * is left in the text, outside the blank.
 *
 * A blank has choices only where pupils answer by choosing: the wrong choices
 * written for it stay with its mark, and are not in a question answered
 * another way.
 */
export function fold(source: string, marks: Mark[], mode: ClozeMode): ClozeText {
	let text = '';
	let from = 0;
	const blanks = marks
		.flatMap((mark) => trim(source, mark) ?? [])
		.map((mark, position): ClozeBlank => {
			const answer = source.slice(mark.start, mark.end);
			text += `${source.slice(from, mark.start)}{{${position + 1}}}`;
			from = mark.end;
			return {
				index: position + 1,
				accepted: [answer, ...mark.others],
				...(mode === 'choices' && mark.wrong.length > 0 ? { choices: [answer, ...mark.wrong] } : {})
			};
		});
	return { text: text + source.slice(from), blanks };
}

/**
 * Where the text was changed, given what it was, what it is and where the
 * caret now stands. Typing, deleting and pasting all leave the caret at the
 * end of what they changed, which settles where a change was when the letters
 * alone cannot (one `o` of `roots` deleted). After anything else, such as an
 * undo, the change is the stretch between what the two texts share at either end.
 */
export function editOf(before: string, after: string, caret: number): Edit {
	let tail = after.length - caret;
	if (tail > before.length || !before.endsWith(after.slice(caret))) {
		const most = Math.min(before.length, after.length);
		tail = 0;
		while (tail < most && before[before.length - 1 - tail] === after[after.length - 1 - tail])
			tail++;
	}
	const most = Math.min(before.length, after.length) - tail;
	let head = 0;
	while (head < most && before[head] === after[head]) head++;
	return { start: head, end: before.length - tail, inserted: after.length - tail - head };
}

/**
 * Whether an edit was made in a stretch's own text. What is typed inside a
 * blank's answer belongs to the answer. What is typed against either end of
 * it does not, so the text can go on after a blank, unless the stretch is
 * `open`: its answer is being typed, and its end is where the typing goes on.
 */
function inside(stretch: Span, edit: Edit, open: boolean): boolean {
	if (edit.start < stretch.start || edit.end > stretch.end) return false;
	if (edit.start < edit.end) return true;
	return edit.start > stretch.start && (edit.start < stretch.end || open);
}

/** A stretch as it is after an edit, or null when the edit took all of it. */
function shift<Stretch extends Span>(stretch: Stretch, edit: Edit, open = false): Stretch | null {
	const grown = edit.inserted - (edit.end - edit.start);
	const whole = edit.start <= stretch.start && edit.end >= stretch.end;
	if (inside(stretch, edit, open)) {
		// Typed over or deleted whole: what stands there now was never made a blank.
		return whole ? null : { ...stretch, end: stretch.end + grown };
	}
	if (edit.end <= stretch.start) {
		return { ...stretch, start: stretch.start + grown, end: stretch.end + grown };
	}
	if (edit.start >= stretch.end) return stretch;
	if (whole) return null;
	// The edit reached over one end: the stretch keeps what is left of it.
	if (edit.start < stretch.start) {
		return { ...stretch, start: edit.start + edit.inserted, end: stretch.end + grown };
	}
	return { ...stretch, end: edit.start };
}

/**
 * The marks after an edit of the text, which now reads `after`. `open` is the
 * place in `marks` of the blank whose answer was being typed, or -1; what
 * comes back with the marks is the place of the one this edit was made in. So
 * an answer's last letters can be deleted and typed again without the new
 * letters falling outside the blank: the caller forgets `open` when the caret
 * is moved by hand.
 */
export function carry(
	after: string,
	marks: Mark[],
	edit: Edit,
	open = -1
): { marks: Mark[]; open: number } {
	const kept: Mark[] = [];
	let typing = -1;
	marks.forEach((mark, at) => {
		const moved = shift(mark, edit, at === open);
		// A blank left with nothing but spaces has no answer, so it is no blank.
		if (!moved || !trim(after, moved)) return;
		if (inside(mark, edit, at === open)) typing = kept.length;
		kept.push(moved);
	});
	return { marks: kept, open: typing };
}

/** A stretch without the spaces at its ends, or null when it holds nothing else. */
export function trim<Stretch extends Span>(source: string, stretch: Stretch): Stretch | null {
	let { start, end } = stretch;
	while (start < end && /\s/.test(source[start])) start++;
	while (end > start && /\s/.test(source[end - 1])) end--;
	return start < end ? { ...stretch, start, end } : null;
}

/** Whether two stretches share a character. */
function overlap(a: Span, b: Span): boolean {
	return a.start < b.end && b.start < a.end;
}

/**
 * The blank a selection is in: the caret inside its answer or against it, or
 * a selection that stays within it.
 */
export function markAt(marks: Mark[], selection: Span): Mark | undefined {
	return marks.find((mark) => mark.start <= selection.start && selection.end <= mark.end);
}

/**
 * The marks after the selected stretch was made a blank. A blank the
 * selection reaches into or over is still that blank, with its other answers,
 * and now has the selected words as its answer; a selection over several
 * blanks makes one new blank of them.
 */
export function addMark(source: string, marks: Mark[], selection: Span): Mark[] {
	const made = trim(source, { ...selection, others: [], wrong: [] });
	if (!made) return marks;
	const covered = marks.filter((mark) => overlap(mark, made));
	const blank = covered.length === 1 ? { ...covered[0], start: made.start, end: made.end } : made;
	return [...marks.filter((mark) => !overlap(mark, made)), blank].sort((a, b) => a.start - b.start);
}
