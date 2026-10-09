import { classroomPractice } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/**
 * A classroom's practice: the stages of its subject, topic by topic, with
 * every time the student has finished each of them here.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom, user } = await parent();
	const { topics, attempts } = await classroomPractice(locals.supabase, classroom);
	// A student reads no sessions but their own.
	return { topics, attempts: attempts[user.id] ?? {} };
};
