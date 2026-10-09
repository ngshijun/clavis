import { pictureMark } from '#lib/item-images.js';
import { comparable } from './absent.js';
import type { ItemPayload } from './payload.js';

/**
 * What a question asks and what it accepts, as one string: two questions with
 * the same key are the same question to a pupil. The import uses it to leave
 * out a row that is already in the stage.
 *
 * The key leaves out what does not make a question another one: the ids the
 * editor made up, the tips, capital letters and the spaces around the words.
 * The ids are what an answer key points with, so each pointer is replaced by
 * what it points at before the ids are dropped. A picture counts by its
 * fingerprint and not by where it is stored: a question that asks the same
 * words about another picture is another question, and the same picture
 * stored twice is one.
 */
export function contentKey(payload: ItemPayload): string {
	return JSON.stringify(comparable(plain(content(payload))));
}

type Entry = { id: string; text: string; image_path?: string | null };

/** What an entry shows a pupil: its words and its picture. */
const shown = (entry: Entry | undefined) => ({
	text: entry?.text ?? '',
	image_path: entry?.image_path
});

/** What the entry an id names shows. */
const shownBy = (list: Entry[], id: string | undefined) =>
	shown(list.find((each) => each.id === id));

/** The payload with every pointer at an id replaced by the words it points at. */
function content(payload: ItemPayload): unknown {
	switch (payload.type) {
		case 'tick_table':
		case 'classify':
			return {
				...payload,
				groups: payload.groups.map((group) => group.text),
				items: payload.items.map((item) => ({
					...shown(item),
					group: shownBy(payload.groups, item.group_id).text
				}))
			};
		case 'matching': {
			const paired = new Set(payload.pairs.map((pair) => pair.right_id));
			return {
				...payload,
				pairs: undefined,
				left: payload.left.map((item) => ({
					...shown(item),
					answer: shownBy(
						payload.right,
						payload.pairs.find((pair) => pair.left_id === item.id)?.right_id
					)
				})),
				// The answers no item uses. They are shown shuffled, so their order is not content.
				right: payload.right
					.filter((item) => !paired.has(item.id))
					.map((item) => JSON.stringify(comparable(plain(shown(item)))))
					.sort()
			};
		}
		case 'ordering':
		case 'rearrange':
			// The right order is the content; the order the items are stored in is not.
			return {
				...payload,
				correct_order: undefined,
				items: payload.correct_order.map((id) => shownBy(payload.items, id))
			};
		default:
			return payload;
	}
}

/** The keys that never make a question another one. */
const LEFT_OUT = new Set(['id', 'tip']);

/**
 * A value without what never makes a question another one: the keys above
 * are gone, words are trimmed and in small letters, and a picture is its
 * fingerprint.
 */
function plain(value: unknown): unknown {
	if (typeof value === 'string') return value.trim().toLowerCase();
	if (Array.isArray(value)) return value.map(plain);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !LEFT_OUT.has(key))
			.map(([key, inner]) => [
				key,
				key === 'image_path' && typeof inner === 'string' ? pictureMark(inner) : plain(inner)
			])
	);
}
