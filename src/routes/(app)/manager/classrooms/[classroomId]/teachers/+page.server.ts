import { error } from '@sveltejs/kit';
import { listClassroomTeachers, listOrganizationTeachers } from '#lib/server/classrooms.js';
import { rosterActions } from '#lib/server/roster.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * A classroom's teachers, and everyone who could join them. An archived
 * classroom's roster stands as it was, so nobody is offered for it.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { user, classroom } = await parent();
	if (!user.organizationId) error(403, 'Forbidden');

	const [teachers, candidates] = await Promise.all([
		listClassroomTeachers(locals.supabase, classroom.id),
		classroom.archivedAt ? [] : listOrganizationTeachers(locals.supabase, user.organizationId)
	]);
	return { teachers, candidates };
};

export const actions: Actions = rosterActions('teachers');
