import { error } from '@sveltejs/kit';
import { getClassroomStudent } from '#lib/server/classrooms.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const student = await getClassroomStudent(locals.supabase, params.classroomId, params.studentId);
	if (!student) error(404, 'Student not found');

	return { student, title: student.name };
};
