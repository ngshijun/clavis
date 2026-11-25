import { listOwnAssignments } from '#lib/server/assignments.js';
import { ownPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * A student's home: what they have been assigned across their classrooms,
 * and for each classroom the stages it is about and every time they have
 * finished one there.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { supabase } = locals;
	const user = signedIn(locals);
	const [assignments, rooms] = await Promise.all([
		listOwnAssignments(supabase, user.id, null),
		parent().then(({ classrooms }) =>
			Promise.all(
				classrooms.map(async (classroom) => ({
					classroom,
					...(await ownPractice(supabase, classroom.id, user.id))
				}))
			)
		)
	]);
	return { assignments, rooms };
};
