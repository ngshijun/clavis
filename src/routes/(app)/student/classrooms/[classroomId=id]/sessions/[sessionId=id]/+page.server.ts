import { error } from '@sveltejs/kit';
import { classroomPracticePath, classroomStagePath } from '#lib/navigation.js';
import { resolvePath } from '#lib/paths.js';
import { findStage, questionImageBase, reviewPracticeSession } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * One of the student's own finished practice sessions in a classroom, marked
 * as they were shown it when they finished. The database hands a student
 * their own sessions and never the right answers; the address has to name
 * the classroom it was practised in as well.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = signedIn(locals);
	const review = await reviewPracticeSession(locals.supabase, params.sessionId);
	if (!review || review.classroomId !== params.classroomId || review.studentId !== user.id) {
		error(404, 'Practice session not found');
	}

	const stage = await findStage(locals.supabase, params.classroomId, review.run.stage.id);
	if (!stage) error(404, 'Practice session not found');

	const practice = resolvePath(classroomPracticePath('student', params.classroomId));
	return {
		// Only what a student is shown: never the right answers.
		review: {
			completedAt: review.completedAt,
			run: review.run,
			answers: review.answers,
			marked: review.marked
		},
		imageBase: questionImageBase(locals.supabase),
		practice,
		again: resolvePath(classroomStagePath(params.classroomId, stage.id)),
		// A topic has no page of its own: it is a section of the classroom's practice.
		trail: [{ label: stage.topic.name, href: `${practice}#${stage.topic.id}` }],
		title: stage.name
	};
};
