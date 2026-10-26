import { listAssignments } from '#lib/server/assignments.js';
import { classroomTopics } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/** What has been assigned in a classroom, with the stages it can be about. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [topics, assignments] = await Promise.all([
		classroomTopics(locals.supabase, params.classroomId),
		listAssignments(locals.supabase, [params.classroomId])
	]);
	return { topics, assignments };
};
