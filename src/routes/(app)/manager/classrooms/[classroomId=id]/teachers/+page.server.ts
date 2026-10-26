import { error } from '@sveltejs/kit';
import {
	getClassroom,
	listClassroomTeachers,
	listOrganizationTeachers
} from '#lib/server/classrooms.js';
import { rosterActions } from '#lib/server/roster.js';
import { signedIn } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A classroom's teachers, and everyone who could join them. An archived
 * classroom's roster stands as it was, so nobody is offered for it.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const { organizationId } = signedIn(locals);
	if (!organizationId) error(403, 'Forbidden');

	const [classroom, teachers, candidates] = await Promise.all([
		getClassroom(locals.supabase, 'manager', params.classroomId),
		listClassroomTeachers(locals.supabase, params.classroomId),
		listOrganizationTeachers(locals.supabase, organizationId)
	]);
	return { teachers, candidates: classroom.archivedAt ? [] : candidates };
};

export const actions: Actions = rosterActions('teachers');
