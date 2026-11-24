import { m } from '#lib/paraglide/messages.js';
import { classroomPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * Every practice session the student has finished in a classroom, with the
 * stages they are of.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = signedIn(locals);
	const { topics, attempts } = await classroomPractice(locals.supabase, params.classroomId);
	// A student reads no sessions but their own.
	return { topics, attempts: attempts[user.id] ?? {}, title: m.practice_history() };
};
