import { listAssignments } from '#lib/server/assignments.js';
import { classroomTopics } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/** What has been assigned in a classroom, with the stages it can be about. */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom } = await parent();
	const [topics, assignments] = await Promise.all([
		classroomTopics(locals.supabase, classroom),
		listAssignments(locals.supabase, classroom.id)
	]);
	return { topics, assignments };
};
