import { error } from '@sveltejs/kit';
import { countToDo, listNotifications } from '#lib/server/assignments.js';
import { listClassrooms } from '#lib/server/classrooms.js';
import type { LayoutServerLoad } from './$types';

/**
 * The person and the classrooms they can reach, for every signed-in page: the
 * sidebar names the active classroom from this list, the pickers show it, and
 * a classroom page resolves its id against it. With them comes what is
 * waiting for the person: a teacher's notifications, and how much a student
 * has yet to do in each classroom.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Reading the address makes this run again on every navigation. Without it the
	// browser keeps the first answer, and someone added to a classroom, or a tab
	// whose session was replaced by another sign-in, would go on seeing the old one.
	void url.pathname;

	const { supabase, user } = locals;
	if (!user) error(401, 'Not signed in');

	const [classrooms, notifications, toDo] = await Promise.all([
		// An admin belongs to no organization and works above every classroom.
		user.role === 'admin' ? [] : listClassrooms(supabase, user.role),
		user.role === 'teacher' ? listNotifications(supabase) : null,
		user.role === 'student' ? countToDo(supabase, user.id) : null
	]);

	return { user, classrooms, notifications, toDo };
};
