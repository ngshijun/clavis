import { comparable } from './absent.js';
import type { ItemPayload } from './payload.js';

/**
 * What a question asks and what it accepts, as one string: two questions with
 * the same key are the same question to a pupil. The import uses it to leave
 * out a row that is already in the stage.
 *
 * The key leaves out what does not make a question another one: the ids the
 * editor made up, the pictures, the tips, capital letters and the spaces
 * around the words. The ids are what an answer key points with, so each
 * pointer is replaced by the words it points at before the ids are dropped.
 */
export function contentKey(payload: ItemPayload): string {
	return JSON.stringify(comparable(plain(content(payload))));
}

/** The words of the entry an id names. */
function textOf(list: { id: string; text: string }[], id: string | undefined): string {
	return list.find((each) => each.id === id)?.text ?? '';
}

/** The payload with every pointer at an id replaced by the words it points at. */
function content(payload: ItemPayload): unknown {
	switch (payload.type) {
		case 'tick_table':
		case 'classify':
			return {
				...payload,
				groups: payload.groups.map((group) => group.text),
				items: payload.items.map((item) => ({
					text: item.text,
					group: textOf(payload.groups, item.group_id)
				}))
			};
		case 'matching': {
			const paired = new Set(payload.pairs.map((pair) => pair.right_id));
			return {
				...payload,
				pairs: undefined,
				left: payload.left.map((item) => ({
					text: item.text,
					answer: textOf(
						payload.right,
						payload.pairs.find((pair) => pair.left_id === item.id)?.right_id
					)
				})),
				// The answers no item uses. They are shown shuffled, so their order is not content.
				right: payload.right
					.filter((item) => !paired.has(item.id))
					.map((item) => item.text.trim().toLowerCase())
					.sort()
			};
		}
		case 'ordering':
		case 'rearrange':
			// The right order is the content; the order the items are stored in is not.
			return {
				...payload,
				correct_order: undefined,
				items: payload.correct_order.map((id) => textOf(payload.items, id))
			};
		default:
			return payload;
	}
}

/** The keys that never make a question another one. */
const LEFT_OUT = new Set(['id', 'image_path', 'tip']);

/**
 * A value without what never makes a question another one: the keys above
 * are gone, and words are trimmed and in small letters.
 */
function plain(value: unknown): unknown {
	if (typeof value === 'string') return value.trim().toLowerCase();
	if (Array.isArray(value)) return value.map(plain);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !LEFT_OUT.has(key))
			.map(([key, inner]) => [key, plain(inner)])
	);
}
