/**
 * What "nothing" is in a question or a passage. Storing a question, telling
 * whether a draft has changed and telling whether two questions are the same
 * all go by this one meaning.
 */

/** Whether a value says nothing: left out, emptied, switched off, or a list with nothing in it. */
export function isAbsent(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === '' ||
		value === false ||
		(Array.isArray(value) && value.length === 0)
	);
}

/**
 * A value as it is compared with another: at every depth, a key that says
 * nothing is not there and the keys stand in one order. So a switch turned on
 * and off again, or a word typed and deleted again, compares as no change.
 */
export function comparable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(comparable);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, inner]) => !isAbsent(inner))
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([key, inner]) => [key, comparable(inner)])
	);
}
