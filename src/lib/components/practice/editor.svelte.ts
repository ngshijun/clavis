import { createContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { imagePaths, uploadKey, uploadRef } from '#lib/item-images.js';
import { comparable } from '#lib/items/absent.js';
import { blankOf } from '#lib/items/kinds.js';
import type { Difficulty, ItemPayload, ItemType } from '#lib/items/payload.js';
import { issueAt, validateItem, type ItemIssue } from '#lib/items/schema.js';
import { validatePassage, type PassageContent } from '#lib/passage.js';
import type { LearningPoint } from '#lib/server/practice.js';

/**
 * The pictures picked in the editor and not saved yet. A picked file stays in
 * the page until Save: the draft names it `upload:<key>`, and the Save action
 * uploads it and writes the stored path in its place.
 */
export class Uploads {
	#base: string;
	#held = new SvelteMap<string, { file: File; url: string }>();

	/** `base` is what a stored picture's path is appended to, to get its public URL. */
	constructor(base: string) {
		this.#base = base;
	}

	/** Holds a picked picture and returns what the draft writes as its `image_path`. */
	add(file: File): string {
		const key = crypto.randomUUID();
		this.#held.set(key, { file, url: URL.createObjectURL(file) });
		return uploadRef(key);
	}

	/** Where a picture is shown from, whether it is stored or still held here. */
	url(path: string | null | undefined): string | undefined {
		if (!path) return undefined;
		const key = uploadKey(path);
		return key === null ? this.#base + path : this.#held.get(key)?.url;
	}

	/** The held files a payload names, by the form field each travels under. */
	filesOf(payload: unknown): [key: string, file: File][] {
		return imagePaths(payload).flatMap((path) => {
			const held = this.#held.get(uploadKey(path) ?? '');
			return held ? [[uploadKey(path)!, held.file]] : [];
		});
	}

	/** Lets go of every held picture. */
	clear() {
		for (const { url } of this.#held.values()) URL.revokeObjectURL(url);
		this.#held.clear();
	}
}

/** A question as the editor opens it. */
export interface DraftSource {
	/** Null for a question that is not stored yet. */
	id: string | null;
	/** The passage the question is on, if any. */
	passageId: string | null;
	difficulty: Difficulty;
	payload: ItemPayload;
	learningPoints: LearningPoint[];
}

/**
 * What two versions of a question or a passage are compared by: a key that
 * says nothing counts as absent and the order of the keys does not count, so
 * typing something and deleting it again, or turning a switch on and off
 * again, is no change.
 */
function fingerprint(value: unknown): string {
	return JSON.stringify(comparable(value));
}

/**
 * The question being edited: a working copy of the stored one, or of a blank
 * one. Forms change `payload` in place; nothing is kept until Save. A new
 * `Draft` is made whenever another question is opened, and after Save and
 * Revert, so it never has to be put back by hand.
 */
export class Draft {
	readonly kind = 'question';
	readonly id: string | null;
	/** The passage the question is on, which it is put on when it is made and stays on. */
	readonly passageId: string | null;
	readonly uploads: Uploads;

	payload: ItemPayload;
	difficulty: Difficulty;
	/** What the question teaches, of what its topic has to choose from. */
	learningPoints: LearningPoint[];
	/**
	 * Whether Save has been tried. Nothing is marked wrong before that, and
	 * afterwards every mark goes as soon as its field is put right.
	 */
	checked = $state(false);

	#stored: string;

	constructor(source: DraftSource, imageBase: string) {
		this.id = source.id;
		this.passageId = source.passageId;
		this.uploads = new Uploads(imageBase);
		this.payload = $state(structuredClone(source.payload));
		this.difficulty = $state(source.difficulty);
		this.learningPoints = $state([...source.learningPoints]);
		this.#stored = this.#fingerprint();
	}

	#fingerprint(): string {
		return fingerprint({
			difficulty: this.difficulty,
			payload: this.payload,
			// The order they were chosen in is not a difference.
			learningPoints: this.learningPoints.map((point) => point.id).sort()
		});
	}

	/** Whether the draft differs from what is stored. */
	readonly dirty = $derived.by(() => this.#fingerprint() !== this.#stored);

	/** What is wrong with the question, once Save has been tried. */
	readonly issues: ItemIssue[] = $derived.by(() => {
		if (!this.checked) return [];
		const result = validateItem($state.snapshot(this.payload));
		return result.ok ? [] : result.issues;
	});

	/** Makes the question one of another type. The question, its picture and its tip stay. */
	setType(type: ItemType) {
		if (type !== this.payload.type) this.payload = blankOf(type, this.payload);
	}

	/** Sets or removes the question's own picture. */
	setImage(path: string | undefined) {
		// Label a Picture cannot do without one: there it is the schema that asks for it back.
		(this.payload as { image_path?: string }).image_path = path;
	}
}

/** A passage as the editor opens it. */
export interface PassageSource {
	/** Null for a passage that is not stored yet. */
	id: string | null;
	content: PassageContent;
}

/**
 * The passage being edited: to its title, text and picture what `Draft` is to
 * a question, and saved, reverted and left the same way. Its questions are no
 * part of it: each is a question of its own, and their order is saved by the
 * drag that changes it.
 */
export class PassageDraft {
	readonly kind = 'passage';
	readonly id: string | null;
	readonly uploads: Uploads;

	content: PassageContent;
	/** Whether Save has been tried; see `Draft.checked`. */
	checked = $state(false);

	#stored: string;

	constructor(source: PassageSource, imageBase: string) {
		this.id = source.id;
		this.uploads = new Uploads(imageBase);
		this.content = $state({ ...source.content });
		this.#stored = fingerprint(this.content);
	}

	/** Whether the draft differs from what is stored. */
	readonly dirty = $derived.by(() => fingerprint(this.content) !== this.#stored);

	/** What is wrong with the passage, once Save has been tried. */
	readonly issues: ItemIssue[] = $derived.by(() => {
		if (!this.checked) return [];
		const result = validatePassage($state.snapshot(this.content));
		return result.ok ? [] : result.issues;
	});
}

/**
 * What a form or a pupil view asks the editor for. It always answers for the
 * question, or the passage, that is open now.
 */
export interface Editor {
	/** What is wrong at one key of what is edited, to show beside its field: `issue('options', 2, 'text')`. */
	issue(...path: (string | number)[]): string | undefined;
	/** Holds a picked picture until Save and returns what to write as its `image_path`. */
	addImage(file: File): string;
	/** The URL to show a picture from, stored or just picked; undefined when there is none. */
	imageUrl(path: string | null | undefined): string | undefined;
}

export const [getEditor, setEditor] = createContext<Editor>();

/** The editor's answers for one draft. */
export function editorOf(draft: () => Draft | PassageDraft): Editor {
	return {
		issue: (...path) => issueAt(draft().issues, ...path),
		addImage: (file) => draft().uploads.add(file),
		imageUrl: (path) => draft().uploads.url(path)
	};
}
