import { listClassroomStudents } from '#lib/server/classrooms.js';
import { classroomPractice, standingsOf } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/** A classroom's students, with where each stands on its stages: a row says what its student has done. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [practice, students] = await Promise.all([
		classroomPractice(locals.supabase, params.classroomId),
		listClassroomStudents(locals.supabase, params.classroomId)
	]);
	return { topics: practice.topics, standings: standingsOf(practice.attempts), students };
};
