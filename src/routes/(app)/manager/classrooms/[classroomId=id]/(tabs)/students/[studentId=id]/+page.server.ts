import { redirect } from '@sveltejs/kit';
import { classroomStudentsPath } from '#lib/navigation.js';
import { resolvePath } from '#lib/paths.js';
import { removeClassroomMember } from '#lib/server/classrooms.js';
import { unexpected } from '#lib/server/forms.js';
import { readStudent } from '#lib/server/staff.js';
import type { Actions, PageServerLoad } from './$types';

/** One student of a classroom, with their practice there. */
export const load: PageServerLoad = ({ locals, params }) =>
	readStudent(locals.supabase, params.classroomId, params.studentId);

export const actions: Actions = {
	/**
	 * Takes the student this page is of out of the classroom, and leads back
	 * to its students, where they are no longer listed. Whether the caller may
	 * is the database's to say: only a manager of the classroom's organization,
	 * and only while it is live.
	 */
	remove: async ({ locals, params }) => {
		try {
			await removeClassroomMember(
				locals.supabase,
				'students',
				params.classroomId,
				params.studentId
			);
		} catch (cause) {
			return unexpected(cause);
		}
		redirect(303, resolvePath(classroomStudentsPath('manager', params.classroomId)));
	}
};
