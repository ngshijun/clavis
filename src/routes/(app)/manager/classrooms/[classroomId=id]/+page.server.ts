import {
	getClassroom,
	listClassroomStudents,
	listOrganizationStudents
} from '#lib/server/classrooms.js';
import { rosterActions } from '#lib/server/roster.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A classroom's students, and everyone who could join them. An archived
 * classroom's roster stands as it was, so nobody is offered for it.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [classroom, students, candidates] = await Promise.all([
		getClassroom(locals.supabase, 'manager', params.classroomId),
		listClassroomStudents(locals.supabase, params.classroomId),
		listOrganizationStudents(locals.supabase)
	]);
	return { students, candidates: classroom.archivedAt ? [] : candidates };
};

export const actions: Actions = rosterActions('students');
