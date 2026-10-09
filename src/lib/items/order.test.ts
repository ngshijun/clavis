import { describe, expect, it } from 'vitest';
import { inOrder } from './order.js';

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id).join();

describe('inOrder', () => {
	it('puts the items in the order their ids are named', () => {
		expect(ids(inOrder(items('a', 'b', 'c'), ['c', 'a', 'b']))).toBe('c,a,b');
	});

	it('puts an item the order does not name last', () => {
		expect(ids(inOrder(items('a', 'b', 'c'), ['c', 'b']))).toBe('c,b,a');
	});

	it('leaves the list it was given as it was', () => {
		const given = items('a', 'b');
		inOrder(given, ['b', 'a']);
		expect(ids(given)).toBe('a,b');
	});
});
