/**
 * A payload as a pupil would get it, made here for a question that is still
 * being written. A stored question is served by the database
 * (`app.sanitize_item_payload`); this draws the same shape from a draft, so
 * the editor can show the question in the very components a pupil answers in.
 *
 * What it mixes up, it mixes by the entries' own ids and words. The order then
 * stays as it is while the admin types, where a real shuffle would move the
 * rows with every keystroke.
 */
import type { ItemPayload } from './payload.js';
import type { ServedItem, ServedThing } from './served.js';

/** A number made from a text, the same every time: something to mix by. */
function scatter(text: string): number {
	let value = 2166136261;
	for (let at = 0; at < text.length; at++) {
		value = Math.imul(value ^ text.charCodeAt(at), 16777619);
	}
	return value >>> 0;
}

/** A list mixed up by what `key` reads from each entry. */
function mixed<T>(list: readonly T[], key: (entry: T) => string): T[] {
	return list
		.map((entry, at) => ({ entry, at, place: scatter(key(entry)) }))
		.sort((a, b) => a.place - b.place || a.at - b.at)
		.map(({ entry }) => entry);
}

/**
 * A mixed list that must not come out in its answer's order: when reading
 * `key` down it gives `solved` from the top, its first entry goes to the end.
 * A pupil is never handed the answer.
 */
function unsolved<T>(list: T[], key: (entry: T) => string, solved: readonly string[]): T[] {
	const given =
		list.length > 1 &&
		solved.length > 0 &&
		solved.length <= list.length &&
		solved.every((want, at) => key(list[at]) === want);
	return given ? [...list.slice(1), list[0]] : list;
}

/** Words to choose from: each once, none empty, mixed up. */
function wordBank(words: readonly string[]): string[] {
	return mixed([...new Set(words.filter((word) => word))], (word) => word);
}

const thing = ({ id, text, image_path }: ServedThing): ServedThing => ({
	id,
	text,
	image_path: image_path ?? null
});

export function serveItem(payload: ItemPayload): ServedItem {
	const common = {
		question: payload.question ?? null,
		image_path: payload.image_path ?? null,
		image_bucket: null
	};

	switch (payload.type) {
		case 'mcq':
		case 'mrq':
		case 'pick_words':
			return {
				...common,
				type: payload.type,
				options: payload.options.map((option, at) => ({
					number: at + 1,
					text: option.text,
					image_path: ('image_path' in option ? option.image_path : null) ?? null,
					image_bucket: null
				}))
			};
		case 'true_false':
			return { ...common, type: payload.type, labels: payload.labels ?? null };
		case 'tick_table':
			return {
				...common,
				type: payload.type,
				groups: payload.groups,
				items: payload.items.map(({ id, text }) => ({ id, text }))
			};
		case 'cloze': {
			const mode = payload.mode ?? 'typing';
			return {
				...common,
				type: payload.type,
				text: payload.text,
				mode,
				reuse: payload.reuse ?? false,
				blanks: payload.blanks.map(({ index, choices }) =>
					mode === 'choices' ? { index, choices: wordBank(choices ?? []) } : { index }
				),
				bank:
					mode === 'bank'
						? wordBank([
								...payload.blanks.map((blank) => blank.accepted[0] ?? ''),
								...(payload.distractors ?? [])
							])
						: null
			};
		}
		case 'short_answer':
			return { ...common, type: payload.type };
		case 'word_completion': {
			// Cut by character, not by code unit, so a letter outside the basic plane is one box.
			const letters = Array.from(payload.answer.replace(/\s/g, ''));
			return {
				...common,
				type: payload.type,
				length: letters.length,
				first_letter: payload.reveal_first ? (letters[0] ?? null) : null
			};
		}
		case 'numeric':
			return {
				...common,
				type: payload.type,
				form: payload.form ?? 'number',
				unit: ('unit' in payload ? payload.unit : null) ?? null,
				units: payload.form === 'measure' ? payload.units : null,
				clock: payload.form === 'time' ? (payload.period === null ? 24 : 12) : null,
				terms: payload.form === 'ratio' ? (payload.parts.length === 3 ? 3 : 2) : null
			};
		case 'matching':
			return {
				...common,
				type: payload.type,
				left: payload.left.map(thing),
				// Never dealt with every answer beside its own item.
				right: unsolved(
					mixed(payload.right.map(thing), (entry) => entry.id),
					(entry) => entry.id,
					payload.left.map(
						(left) => payload.pairs.find((pair) => pair.left_id === left.id)?.right_id ?? ''
					)
				)
			};
		case 'ordering':
			return {
				...common,
				type: payload.type,
				items: unsolved(
					mixed(payload.items.map(thing), (entry) => entry.id),
					(entry) => entry.id,
					payload.correct_order
				)
			};
		case 'rearrange':
			return {
				...common,
				type: payload.type,
				// By the chips' words, since two chips can carry the same word.
				items: unsolved(
					mixed(
						payload.items.map(({ id, text }) => ({ id, text })),
						(entry) => entry.id
					),
					(entry) => entry.text,
					payload.correct_order.map(
						(id) => payload.items.find((item) => item.id === id)?.text ?? ''
					)
				)
			};
		case 'classify':
			return {
				...common,
				type: payload.type,
				groups: payload.groups,
				items: mixed(payload.items.map(thing), (entry) => entry.id)
			};
		case 'label_picture':
			return {
				...common,
				type: payload.type,
				mode: payload.mode,
				markers: payload.labels.map(({ id, x, y }, at) => ({ id, number: at + 1, x, y })),
				// A word for each part, so a word two parts share is there twice, and the extra words.
				bank:
					payload.mode === 'bank'
						? mixed(
								[
									...payload.labels.map((label) => ({ word: label.text.trim(), by: label.id })),
									...(payload.distractors ?? []).map((word) => ({ word, by: word }))
								].filter(({ word }) => word),
								({ by }) => by
							).map(({ word }) => word)
						: null
			};
	}
}
