/**
 * A word bank: words a pupil picks up and puts into places. Shared by the
 * types that have one.
 */

export interface BankWord {
	word: string;
	/** Whether it can still be picked up. */
	free: boolean;
}

/**
 * The bank's words with those in use marked. A word put somewhere is used up,
 * once for each place it stands in, unless the bank lets a word be used again.
 */
export function bankWords(bank: readonly string[], placed: readonly string[], reuse: boolean) {
	const used = [...placed];
	return bank.map((word): BankWord => {
		const at = reuse ? -1 : used.indexOf(word);
		if (at !== -1) used.splice(at, 1);
		return { word, free: at === -1 };
	});
}

/**
 * Which place a picked-up word goes to: the one the pupil chose, or else the
 * first empty one. Undefined when every place is filled.
 */
export function nextPlace<Key>(
	places: readonly Key[],
	filled: (place: Key) => boolean,
	chosen: Key | undefined
): Key | undefined {
	if (chosen !== undefined && places.includes(chosen)) return chosen;
	return places.find((place) => !filled(place));
}
