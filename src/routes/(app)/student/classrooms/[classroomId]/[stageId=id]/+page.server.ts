import { error, fail } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { classroomPath } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { unexpected } from '#lib/server/forms.js';
import {
	findStage,
	postedAnswers,
	questionImageBase,
	servePracticeStage,
	submitPracticeSession
} from '#lib/server/run.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A stage for a student to practise in one of their classrooms. The database
 * deals it only to a student of the classroom and only a stage of the
 * classroom's subject.
 *
 * Every load deals the stage afresh, so finishing must not load again: the
 * page posts its answers and keeps the run it was given. Nothing is recorded
 * until then, so leaving the page leaves nothing behind.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { classroom } = await parent();
	const stage = await findStage(locals.supabase, classroom.subjectId, params.stageId);
	if (!stage) error(404, 'Stage not found');

	const run = await servePracticeStage(locals.supabase, classroom.id, stage.id);
	if (run.total === 0) error(404, 'Stage not found');

	const practice = resolve(classroomPath('student', classroom.id));
	return {
		run,
		imageBase: questionImageBase(locals.supabase),
		practice,
		// A topic has no page of its own: it is a section of the classroom's practice.
		trail: [{ label: stage.topic.name, href: `${practice}#${stage.topic.id}` }],
		title: stage.name
	};
};

export const actions: Actions = {
	/** Records the finished run as a practice session and answers with how it was marked. */
	submit: async ({ request, locals, params }) => {
		const answers = await postedAnswers(request);
		if (!answers) return fail(400, { message: m.error_unexpected() });

		try {
			return {
				marked: await submitPracticeSession(
					locals.supabase,
					params.classroomId,
					params.stageId,
					answers
				)
			};
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
