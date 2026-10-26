import { ACCOUNT } from '#lib/navigation.js';
import { countToDo, listNotifications } from '#lib/server/assignments.js';
import { listClassrooms } from '#lib/server/classrooms.js';
import { signedIn } from '#lib/server/session.js';
import type { LayoutServerLoad } from './$types';

/**
 * The person and the classrooms they can reach, for every signed-in page: the
 * sidebar names the active classroom from this list and the pickers show it.
 * With them comes what is waiting for the person: a teacher's notifications,
 * and how much a student has yet to do in each classroom.
 *
 * It is read once and kept while the person moves between pages. An action
 * reads it again when it is done, and so does the page when the person comes
 * back to its tab, which is when someone else's change, such as being added to
 * a classroom or another sign-in in the same browser, would show.
 */
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends(ACCOUNT);

	const { supabase } = locals;
	const user = signedIn(locals);

	const [classrooms, notifications, toDo] = await Promise.all([
		// An admin belongs to no organization and works above every classroom.
		user.role === 'admin' ? [] : listClassrooms(supabase, user.role),
		user.role === 'teacher' ? listNotifications(supabase) : null,
		user.role === 'student' ? countToDo(supabase, user.id) : null
	]);

	return { user, classrooms, notifications, toDo };
};
