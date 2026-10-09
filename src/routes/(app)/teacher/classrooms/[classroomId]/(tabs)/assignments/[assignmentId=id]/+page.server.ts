import { error, fail, redirect } from '@sveltejs/kit';
import { sinceAssigned } from '#lib/items/assignments.js';
import { bestOf } from '#lib/items/stars.js';
import { classroomPath } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
import { deleteAssignment, getAssignment } from '#lib/server/assignments.js';
import { listClassroomStudents } from '#lib/server/classrooms.js';
import { unexpected } from '#lib/server/forms.js';
import { classroomPractice } from '#lib/server/run.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * One assignment of a classroom: every student it was given to, with when
 * they did it and the best they have scored on its stage since it was
 * assigned. Practice from before it was assigned does not count towards it.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { classroom } = await parent();
	const [assignment, practice, students] = await Promise.all([
		getAssignment(locals.supabase, classroom.id, params.assignmentId),
		classroomPractice(locals.supabase, classroom),
		listClassroomStudents(locals.supabase, classroom.id)
	]);
	if (!assignment) error(404, 'Assignment not found');

	const topic = practice.topics.find((each) =>
		each.stages.some((stage) => stage.id === assignment.stageId)
	);
	const stage = topic?.stages.find((each) => each.id === assignment.stageId);
	if (!topic || !stage) error(404, 'Assignment not found');

	const given = new Map(assignment.students.map((student) => [student.studentId, student.doneAt]));
	// In the roster's order, which is by name: those who have done it, then those who have yet to.
	const rows = students
		.filter((student) => given.has(student.id))
		.map((student) => ({
			id: student.id,
			name: student.name,
			doneAt: given.get(student.id) ?? null,
			best:
				bestOf(
					sinceAssigned(practice.attempts[student.id]?.[stage.id] ?? [], assignment.assignedAt)
				) ?? null
		}))
		.sort((a, b) => Number(b.doneAt !== null) - Number(a.doneAt !== null));

	return {
		assignment: {
			assignedAt: assignment.assignedAt,
			assignedBy: assignment.assignedBy,
			dueAt: assignment.dueAt
		},
		stage,
		topic: { name: topic.name },
		rows,
		title: stage.name
	};
};

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
