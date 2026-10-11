/** The items in the order `order` names them by id. One it does not name goes last. */
export function inOrder<T extends { id: string }>(
	items: readonly T[],
	order: readonly string[]
): T[] {
	const place = (item: T) => {
		const at = order.indexOf(item.id);
		return at === -1 ? order.length : at;
	};
	// Sorting keeps two items that share a place in the order they came in.
	return [...items].sort((a, b) => place(a) - place(b));
}
