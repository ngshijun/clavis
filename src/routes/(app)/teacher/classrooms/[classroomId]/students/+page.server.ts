import { listClassroomStudents } from '#lib/server/classrooms.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	return { students: await listClassroomStudents(locals.supabase, params.classroomId) };
};
