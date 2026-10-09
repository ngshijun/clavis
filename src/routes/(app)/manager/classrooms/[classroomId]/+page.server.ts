import { listClassroomStudents, listOrganizationStudents } from '#lib/server/classrooms.js';
import { rosterActions } from '#lib/server/roster.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A classroom's students, and everyone who could join them. An archived
 * classroom's roster stands as it was, so nobody is offered for it.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom } = await parent();
	const [students, candidates] = await Promise.all([
		listClassroomStudents(locals.supabase, classroom.id),
		classroom.archivedAt ? [] : listOrganizationStudents(locals.supabase)
	]);
	return { students, candidates };
};

export const actions: Actions = rosterActions('students');
