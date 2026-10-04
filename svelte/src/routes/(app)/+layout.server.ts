import { error } from '@sveltejs/kit';
import { listClassrooms } from '#lib/server/classrooms.js';
import type { LayoutServerLoad } from './$types';

/**
 * The person and the classrooms they can reach, for every signed-in page: the
 * sidebar names the active classroom from this list, the pickers show it, and
 * a classroom page resolves its id against it.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Reading the address makes this run again on every navigation. Without it the
	// browser keeps the first answer, and someone added to a classroom, or a tab
	// whose session was replaced by another sign-in, would go on seeing the old one.
	void url.pathname;

	const user = locals.user;
	if (!user) error(401, 'Not signed in');

	// An admin belongs to no organization and works above every classroom.
	const classrooms = user.role === 'admin' ? [] : await listClassrooms(locals.supabase, user.role);

	return { user, classrooms };
};
