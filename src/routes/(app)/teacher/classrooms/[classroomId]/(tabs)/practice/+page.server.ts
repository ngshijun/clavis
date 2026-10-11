import { fail } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { assignStage } from '#lib/server/assignments.js';
import { listClassroomStudents } from '#lib/server/classrooms.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import { classroomPractice, standingsOf } from '#lib/server/run.js';
import type { Actions, PageServerLoad } from './$types';

/** A classroom's practice as its teacher follows it: the stages, the students, and where each student stands on each stage. */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom } = await parent();
	const [practice, students] = await Promise.all([
		classroomPractice(locals.supabase, classroom),
		listClassroomStudents(locals.supabase, classroom.id)
	]);
	return { topics: practice.topics, standings: standingsOf(practice.attempts), students };
};

const assignSchema = z.object({
	stageId: z.guid(),
	studentIds: z.array(z.guid()).min(1),
	// The end of the due day where the teacher is, which only their browser knows.
	dueAt: z.iso.datetime().optional()
});

export const actions: Actions = {
	/**
	 * Assigns a stage to some of the classroom's students. The database checks
	 * the rest: that the caller teaches the classroom, that the stage can be
	 * practised there and that every student named is one of its own.
	 */
	assign: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = assignSchema.safeParse({
			...formValues(form),
			studentIds: form.getAll('studentId')
		});
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { stageId, studentIds, dueAt = null } = parsed.data;
		if (dueAt && Date.parse(dueAt) <= Date.now()) {
			return fail(400, { message: m.assignment_due_past() });
		}

		try {
			await assignStage(locals.supabase, {
				classroomId: params.classroomId,
				stageId,
				studentIds,
				dueAt
			});
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
