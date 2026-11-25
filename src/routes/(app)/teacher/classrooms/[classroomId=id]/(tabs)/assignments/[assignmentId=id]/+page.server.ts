import { fail, redirect } from '@sveltejs/kit';
import { classroomPath } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
import { deleteAssignment } from '#lib/server/assignments.js';
import { unexpected } from '#lib/server/forms.js';
import { readAssignment } from '#lib/server/staff.js';
import type { Actions, PageServerLoad } from './$types';

/** One assignment of a classroom, with every student it was given to. */
export const load: PageServerLoad = ({ locals, params }) =>
	readAssignment(locals.supabase, params.classroomId, params.assignmentId);

export const actions: Actions = {
	/**
	 * Deletes the assignment, and with it who it was given to and what its
	 * teacher was told of it. The practice the students have done stays.
	 */
	delete: async ({ locals, params }) => {
		try {
			const deleted = await deleteAssignment(
				locals.supabase,
				params.classroomId,
				params.assignmentId
			);
			if (!deleted) return fail(404, { message: m.error_unexpected() });
		} catch (cause) {
			return unexpected(cause);
		}
		redirect(303, resolvePath(classroomPath('teacher', params.classroomId)));
	}
};
