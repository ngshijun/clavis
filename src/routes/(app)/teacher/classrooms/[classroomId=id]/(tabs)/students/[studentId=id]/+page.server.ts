import { error } from '@sveltejs/kit';
import { getClassroomStudent } from '#lib/server/classrooms.js';
import { classroomPractice } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/** One student of a classroom, with their practice there. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [student, practice] = await Promise.all([
		getClassroomStudent(locals.supabase, params.classroomId, params.studentId),
		classroomPractice(locals.supabase, params.classroomId)
	]);
	if (!student) error(404, 'Student not found');

	return {
		student,
		topics: practice.topics,
		attempts: practice.attempts[student.id] ?? {},
		title: student.name
	};
};
