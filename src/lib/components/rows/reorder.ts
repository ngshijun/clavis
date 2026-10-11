import { postAction } from '#lib/form-actions.js';
import type { Placement } from './context.js';
import { settle } from './feedback.js';

/** How long rows take to make room for the one being dragged. */
export const FLIP_MS = 150;

/** Every save so far, one after another: the next one waits for this. */
let saves: Promise<unknown> = Promise.resolve();

/** The order last asked for in each place where a save is still on its way. */
const asked = new Map<string, string>();

/**
 * Saves the order a drag left the rows in, unless it left them where they
 * were, and answers whether that order stands. When it does not, because the
 * server refused it or could not be reached, the caller puts its rows back as
 * they are stored: a drag that was not saved must not look saved.
 *
 * Saves are posted one at a time, in the order they were asked for. A row
 * moved from the keyboard asks for one at every step, and the server must not
 * get a later order before an earlier one: whichever it wrote last would
 * stand. A save that a later one of the same rows has overtaken is not posted
 * at all.
 */
export function saveOrder(
	place: Placement,
	before: { id: string }[],
	after: { id: string }[]
): Promise<boolean> {
	const key = `${place.kind}:${place.parentId ?? ''}`;
	const ids = after.map((row) => row.id);
	const order = ids.join();
	// While a save is on its way, `before` is older than what was last asked for.
	const standing = asked.get(key) ?? before.map((row) => row.id).join();
	if (order === standing) return saves.then(() => true);
	asked.set(key, order);

	const save = saves.then(async () => {
		// Overtaken: the later save answers for these rows.
		if (asked.get(key) !== order) return true;

		const form = new FormData();
		form.set('kind', place.kind);
		if (place.parentId) form.set('parentId', place.parentId);
		for (const id of ids) form.append('ids', id);
		try {
			return await settle(await postAction('?/reorder', form));
		} finally {
			// The page has what is stored again, so `before` can be trusted from here on.
			if (asked.get(key) === order) asked.delete(key);
		}
	});
	// A save that could not be posted does not hold up the ones after it.
	saves = save.catch(() => {});
	return save;
}
