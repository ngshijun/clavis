import { fail, redirect } from '@sveltejs/kit';
import * as z from 'zod';
import { assignmentPath } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
import { markNotificationsSeen } from '#lib/server/assignments.js';
import { countStudents } from '#lib/server/classrooms.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classrooms } = await parent();
	const classroomIds = classrooms.map((classroom) => classroom.id);
	return { studentCount: await countStudents(locals.supabase, classroomIds) };
};

/**
 * What the bell in the top bar posts to, from whichever page it is pressed
 * on: a teacher's notifications belong to no one classroom, and their home
 * is the one page that is always theirs.
 */
export const actions: Actions = {
	/** Opens the assignment a notification is about, and marks what the teacher was told of it as seen. */
	openNotification: async ({ request, locals }) => {
		const parsed = z
			.object({ classroomId: z.guid(), assignmentId: z.guid() })
			.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { classroomId, assignmentId } = parsed.data;

		try {
			await markNotificationsSeen(locals.supabase, assignmentId);
		} catch (cause) {
			return unexpected(cause);
		}
		redirect(303, resolvePath(assignmentPath(classroomId, assignmentId)));
	},

	/** Marks every one of the teacher's notifications as seen. */
	readNotifications: async ({ locals }) => {
		try {
			await markNotificationsSeen(locals.supabase, null);
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
