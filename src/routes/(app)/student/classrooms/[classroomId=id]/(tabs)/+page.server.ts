import { listOwnAssignments } from '#lib/server/assignments.js';
import { ownPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * What the student has been assigned in a classroom, with the stages it is
 * about and every time they have finished each of them here.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = signedIn(locals);
	const [practice, assignments] = await Promise.all([
		ownPractice(locals.supabase, params.classroomId, user.id),
		listOwnAssignments(locals.supabase, user.id, [params.classroomId])
	]);
	return { ...practice, assignments };
};
