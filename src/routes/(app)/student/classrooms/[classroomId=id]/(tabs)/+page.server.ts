import { listAssignments } from '#lib/server/assignments.js';
import { classroomPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * What the student has been assigned in a classroom, with the stages it is
 * about and every time they have finished each of them here.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = signedIn(locals);
	const [{ topics, attempts }, assignments] = await Promise.all([
		classroomPractice(locals.supabase, params.classroomId),
		listAssignments(locals.supabase, [params.classroomId])
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
