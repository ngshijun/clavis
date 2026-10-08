import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';

/** Where the pictures of questions and passages are kept, a folder a stage. */
export const QUESTION_IMAGES = 'question-images';

/**
 * The folder that holds every picture of a stage's questions and passages.
 * The pictures lie side by side in it, none beneath another, so listing the
 * folder lists them all.
 */
export function stageFolder(stageId: string): string {
	return `stages/${stageId}`;
}

/**
 * Removes every picture of the stages that were just deleted. This is the one
 * way a stage's pictures go with it, whether the stage itself was deleted or
 * the topic, subject or grade level it was under.
 *
 * It runs after the rows are gone, so a refused delete leaves the pictures
 * where they are, and what goes wrong here is logged and not raised: the rows
 * cannot be brought back for it.
 */
export async function removeStagePictures(
	supabase: SupabaseClient<Database>,
	stageIds: string[]
): Promise<void> {
	const pictures = supabase.storage.from(QUESTION_IMAGES);
	for (const stageId of stageIds) {
		const folder = stageFolder(stageId);
		// The folder is emptied a page at a time, until a page comes back empty.
		for (;;) {
			const listed = await pictures.list(folder);
			if (listed.error) {
				console.error(listed.error);
				break;
			}
			if (listed.data.length === 0) break;

			const removed = await pictures.remove(listed.data.map((file) => `${folder}/${file.name}`));
			// A page of which nothing was removed would be listed again for ever.
			if (removed.error || removed.data.length === 0) {
				console.error(removed.error ?? new Error(`No picture of ${folder} could be removed`));
				break;
			}
		}
	}
}
