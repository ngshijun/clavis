import { error, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { practiceStagePath, stageTrail } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { unexpected } from '#lib/server/forms.js';
import { getStage } from '#lib/server/practice.js';
import { markStagePreview, postedAnswers, previewStage } from '#lib/server/run.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A stage played as a pupil gets it, for the admin who is writing it. Only an
 * admin reaches the page and the database deals a preview to nobody else.
 * Nothing answered here is recorded.
 *
 * Every load deals the stage afresh, so marking must not load again: the page
 * posts its answers and keeps the run it was given.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const stage = await getStage(locals.supabase, params.subjectId, params.stageId);
	if (!stage) error(404, 'Stage not found');

	const builder = resolve(practiceStagePath(stage.subject.id, stage.id));
	return {
		run: await previewStage(locals.supabase, stage.id),
		imageBase: stage.imageBase,
		builder,
		trail: [...stageTrail(stage), { label: stage.name, href: builder }],
		title: m.practice_preview()
	};
};

export const actions: Actions = {
	/** Marks the answers and records nothing. */
	mark: async ({ request, locals, params }) => {
		const answers = await postedAnswers(request);
		if (!answers) return fail(400, { message: m.error_unexpected() });

		try {
			return { marked: await markStagePreview(locals.supabase, params.stageId, answers) };
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
