import * as z from 'zod';
import {
	MAX_IMAGE_PATH_CHARS,
	MAX_PASSAGE_BODY_CHARS,
	MAX_PASSAGE_TITLE_CHARS
} from '#lib/items/limits.js';
import { text, type ItemIssue } from '#lib/items/schema.js';
import { m } from '#lib/paraglide/messages.js';

/**
 * What a passage says: the part of it that is written in the builder and
 * stored. Its picture is named as every picture of a question is, by a key
 * called `image_path`, so the helpers in `item-images` find it too.
 */
export interface PassageContent {
	title: string;
	/** The text pupils read. May be empty when the passage is a picture. */
	body: string;
	/** An object path in the question images bucket, or `upload:<key>` before Save. */
	image_path: string | null;
}

/** A passage that has not been written yet. */
export function blankPassage(): PassageContent {
	return { title: '', body: '', image_path: null };
}

/**
 * What a COMPLETE passage is, as the editor's Save and the server check it:
 * the rules of the `passages` table, in words for the person writing it. What
 * comes out is tidied for storing.
 */
export const passageSchema = z
	.object({
		title: text(MAX_PASSAGE_TITLE_CHARS).min(1, {
			error: () => m.practice_passage_title_required()
		}),
		body: text(MAX_PASSAGE_BODY_CHARS),
		image_path: text(MAX_IMAGE_PATH_CHARS)
			.nullish()
			.transform((path) => path || null)
	})
	.check((context) => {
		const { body, image_path } = context.value;
		if (body !== '' || image_path) return;
		// Said at the text, which is where most passages begin.
		context.issues.push({
			code: 'custom',
			input: context.value,
			path: ['body'],
			message: m.practice_passage_content_required()
		});
	}) satisfies z.ZodType<PassageContent>;

/** Checks a passage and tidies it for storing; see `validateItem`, which this answers like. */
export function validatePassage(
	content: unknown
): { ok: true; content: PassageContent } | { ok: false; issues: ItemIssue[] } {
	// A refusal with no words of ours is of a passage the editor did not build.
	const parsed = passageSchema.safeParse(content, { error: () => m.error_unexpected() });
	if (parsed.success) return { ok: true, content: parsed.data };
	return {
		ok: false,
		issues: parsed.error.issues.map(({ path, message }) => ({
			path: path.filter((key) => typeof key !== 'symbol'),
			message
		}))
	};
}

/**
 * What a passage says, as one string: two passages with the same key read the
 * same to a pupil. The import uses it to put a question under a passage that
 * is already in the stage rather than make the passage a second time. A
 * picture, capital letters and the spaces around the words are left out.
 */
export function passageKey(passage: Pick<PassageContent, 'title' | 'body'>): string {
	return JSON.stringify([passage.title, passage.body].map((text) => text.trim().toLowerCase()));
}
