import { m } from '#lib/paraglide/messages.js';
import { ownPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * Every practice session the student has finished in a classroom, with the
 * stages they are of.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const practice = await ownPractice(locals.supabase, params.classroomId, signedIn(locals).id);
	return { ...practice, title: m.practice_history() };
};
