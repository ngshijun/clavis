import { newId } from '#lib/items/kinds.js';
import type { Item, MatchingPayload } from '#lib/items/payload.js';

/**
 * A Matching question as its form shows it. The form's row is one right pair,
 * a left item beside its answer; the payload keeps the two sides apart and
 * joins them by id, so that one answer can serve two left items and an answer
 * can be left with no partner. These functions change the payload in place,
 * one row at a time.
 */
type Sides = Pick<MatchingPayload, 'left' | 'right' | 'pairs'>;

/** What an answer shows a pupil: its words and its picture. */
type Face = Pick<Item, 'text' | 'image_path'>;

/** The answer a left item is paired with, if it has one. */
export function answerOf(sides: Sides, leftId: string): Item | undefined {
	const pair = sides.pairs.find((each) => each.left_id === leftId);
	return pair && sides.right.find((item) => item.id === pair.right_id);
}

/** The answers that go with no left item: they are there to be wrong. */
export function extrasOf(sides: Sides): Item[] {
	return sides.right.filter((item) => uses(sides, item.id) === 0);
}

/** How many left items an answer serves. */
function uses(sides: Sides, rightId: string): number {
	return sides.pairs.filter((pair) => pair.right_id === rightId).length;
}

function pairUp(sides: Sides, leftId: string, rightId: string) {
	const pair = sides.pairs.find((each) => each.left_id === leftId);
	if (pair) pair.right_id = rightId;
	else sides.pairs.push({ left_id: leftId, right_id: rightId });
}

function drop(sides: Sides, rightId: string) {
	sides.right = sides.right.filter((item) => item.id !== rightId);
}

/**
 * Gives a row the answer `next`, as it is typed or its picture is changed.
 *
 * Two rows that show the same answer share one right item: a pupil sees it
 * once and joins both left items to it. So a row whose answer comes to match
 * another row's takes that row's item, and a row that shares its answer gets
 * an item of its own the moment it is edited, which leaves the other row as it
 * was. An extra answer is never taken over: it would stop being an extra.
 */
export function setAnswer(sides: Sides, leftId: string, next: Face) {
	const was = answerOf(sides, leftId);
	const shared = was !== undefined && uses(sides, was.id) > 1;
	const picture = next.image_path || undefined;

	const same =
		(next.text || picture) &&
		sides.right.find(
			(item) =>
				item.id !== was?.id &&
				uses(sides, item.id) > 0 &&
				item.text === next.text &&
				(item.image_path || undefined) === picture
		);

	if (same) {
		pairUp(sides, leftId, same.id);
		// The row's own item would be left over as an extra answer nobody asked for.
		if (was && !shared) drop(sides, was.id);
	} else if (was && !shared) {
		was.text = next.text;
		was.image_path = picture;
	} else {
		const own: Item = { id: newId(), text: next.text, ...(picture ? { image_path: picture } : {}) };
		// Beside the answer it was cut from, so the right side keeps the order of the rows.
		const at = was ? sides.right.findIndex((item) => item.id === was.id) + 1 : sides.right.length;
		sides.right.splice(at, 0, own);
		pairUp(sides, leftId, own.id);
	}
}

/** Adds an empty row and returns the id of its left item. */
export function addRow(sides: Sides): string {
	const left: Item = { id: newId(), text: '' };
	const right: Item = { id: newId(), text: '' };
	sides.left.push(left);
	sides.right.push(right);
	sides.pairs.push({ left_id: left.id, right_id: right.id });
	return left.id;
}

/** Removes a row. Its answer goes with it unless another row uses it too. */
export function removeRow(sides: Sides, leftId: string) {
	const answer = answerOf(sides, leftId);
	sides.left = sides.left.filter((item) => item.id !== leftId);
	sides.pairs = sides.pairs.filter((pair) => pair.left_id !== leftId);
	if (answer && uses(sides, answer.id) === 0) drop(sides, answer.id);
}
