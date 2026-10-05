import { countStudents } from '#lib/server/classrooms.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classrooms } = await parent();
	const classroomIds = classrooms.map((classroom) => classroom.id);
	return { studentCount: await countStudents(locals.supabase, classroomIds) };
};
