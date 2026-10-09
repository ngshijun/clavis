import { listAssignments } from '#lib/server/assignments.js';
import { classroomPractice } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/**
 * What the student has been assigned in a classroom, with the stages it is
 * about and every time they have finished each of them here.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom, user } = await parent();
	const [{ topics, attempts }, assignments] = await Promise.all([
		classroomPractice(locals.supabase, classroom),
		listAssignments(locals.supabase, classroom.id)
	]);

	return {
		topics,
		// A student reads no sessions but their own, and of an assignment only that it was given to them.
		attempts: attempts[user.id] ?? {},
		assignments: assignments.map(({ students, ...assignment }) => ({
			...assignment,
			doneAt: students.find((student) => student.studentId === user.id)?.doneAt ?? null
		}))
	};
};
