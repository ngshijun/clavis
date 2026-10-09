import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveOrder } from './reorder.js';

/** Each post waits here until the test lets it through, as a slow server would make it. */
const posts: { ids: string[]; parentId: FormDataEntryValue | null; finish: () => void }[] = [];
/** What `settle` answers for the next post: whether the order was saved. */
let settled = true;

vi.mock('#lib/form-actions.js', () => ({
	postAction: (_action: string, form: FormData) =>
		// What the action answers is `settle`'s business, and `settle` is not under test.
		new Promise<void>((resolve) => {
			posts.push({
				ids: form.getAll('ids').map(String),
				parentId: form.get('parentId'),
				finish: resolve
			});
		})
}));
vi.mock('./feedback.js', () => ({ settle: async () => settled }));

const rows = (...ids: string[]) => ids.map((id) => ({ id }));
/** Lets everything that is ready to run, run. */
const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('saveOrder', () => {
	beforeEach(() => {
		posts.length = 0;
		settled = true;
	});

	it('posts the new order, and nothing for rows left where they were', async () => {
		await saveOrder({ kind: 'topic', parentId: 'unmoved' }, rows('a', 'b'), rows('a', 'b'));
		expect(posts).toHaveLength(0);

		const saved = saveOrder({ kind: 'topic', parentId: 'moved' }, rows('a', 'b'), rows('b', 'a'));
		await tick();
		expect(posts).toHaveLength(1);
		expect(posts[0]).toMatchObject({ ids: ['b', 'a'], parentId: 'moved' });
		posts[0].finish();
		await saved;
	});

	it('posts one save at a time, in the order they were asked for', async () => {
		const stored = rows('a', 'b', 'c');
		const first = saveOrder({ kind: 'topic', parentId: 'one' }, stored, rows('b', 'a', 'c'));
		const second = saveOrder({ kind: 'topic', parentId: 'two' }, stored, rows('c', 'b', 'a'));
		await tick();
		expect(posts.map((post) => post.parentId)).toEqual(['one']);

		posts[0].finish();
		await first;
		await tick();
		expect(posts.map((post) => post.parentId)).toEqual(['one', 'two']);
		posts[1].finish();
		await second;
	});

	it('posts only the last of several orders asked for the same rows while one waits its turn', async () => {
		const place = { kind: 'topic', parentId: 'steps' };
		const stored = rows('a', 'b', 'c');
		// Held up by a save elsewhere, as the steps of a row moved from the keyboard are by the first.
		const elsewhere = saveOrder(
			{ kind: 'topic', parentId: 'elsewhere' },
			stored,
			rows('b', 'a', 'c')
		);
		saveOrder(place, stored, rows('a', 'c', 'b'));
		saveOrder(place, stored, rows('c', 'a', 'b'));
		const last = saveOrder(place, stored, rows('c', 'b', 'a'));
		await tick();
		posts[0].finish();
		await elsewhere;
		await tick();
		expect(posts.slice(1).map((post) => post.ids)).toEqual([['c', 'b', 'a']]);
		posts[1].finish();
		await last;
	});

	it('saves a move back to the stored order when the move away is still on its way', async () => {
		const place = { kind: 'topic', parentId: 'back' };
		const stored = rows('a', 'b');
		saveOrder(place, stored, rows('b', 'a'));
		const back = saveOrder(place, stored, rows('a', 'b'));
		await tick();
		// The move away was overtaken before it was posted, so only the last order goes out.
		expect(posts.map((post) => post.ids)).toEqual([['a', 'b']]);
		posts[0].finish();
		await back;

		// With nothing on its way, the stored order is what a drag is compared with again.
		await saveOrder(place, stored, rows('a', 'b'));
		expect(posts).toHaveLength(1);
	});

	it('answers whether the order stands, so that rows that were not saved can be put back', async () => {
		const stored = rows('a', 'b');
		expect(await saveOrder({ kind: 'topic', parentId: 'still' }, stored, rows('a', 'b'))).toBe(
			true
		);

		const kept = saveOrder({ kind: 'topic', parentId: 'kept' }, stored, rows('b', 'a'));
		await tick();
		posts[0].finish();
		expect(await kept).toBe(true);

		settled = false;
		const refused = saveOrder({ kind: 'topic', parentId: 'refused' }, stored, rows('b', 'a'));
		await tick();
		posts[1].finish();
		expect(await refused).toBe(false);

		// A refused order is not what is stored: the same drag is posted again.
		settled = true;
		const again = saveOrder({ kind: 'topic', parentId: 'refused' }, stored, rows('b', 'a'));
		await tick();
		expect(posts).toHaveLength(3);
		posts[2].finish();
		expect(await again).toBe(true);
	});
});
