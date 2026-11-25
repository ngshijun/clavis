import { listOrganizationStudents } from '#lib/server/classrooms.js';
import { rosterActions } from '#lib/server/roster.js';
import { readClass } from '#lib/server/staff.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A classroom's students, with where each stands on its stages, and everyone
 * who could join them: a closed account joins no classroom.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [read, candidates] = await Promise.all([
		readClass(locals.supabase, params.classroomId),
		listOrganizationStudents(locals.supabase)
	]);
	return { ...read, candidates: candidates.filter((student) => student.closedAt === null) };
};

/** A student is taken off from their own page, so this one only adds. */
export const actions: Actions = { add: rosterActions('students').add };
