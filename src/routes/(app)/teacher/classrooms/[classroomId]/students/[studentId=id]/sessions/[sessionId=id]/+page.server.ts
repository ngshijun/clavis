import { error } from '@sveltejs/kit';
import { studentPath } from '#lib/navigation.js';
import { resolvePath } from '#lib/paths.js';
import { getClassroomStudent } from '#lib/server/classrooms.js';
import { questionImageBase, reviewPracticeSession } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/**
 * One finished practice session of a student of the classroom, as the
 * student was shown it marked. The database hands a session to its
 * classroom's staff; the address has to name the classroom and the student
 * it is of as well.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { classroom } = await parent();
	const [student, review] = await Promise.all([
		getClassroomStudent(locals.supabase, classroom.id, params.studentId),
		reviewPracticeSession(locals.supabase, params.sessionId)
	]);
	if (
		!student ||
		!review ||
		review.classroomId !== classroom.id ||
		review.studentId !== student.id
	) {
		error(404, 'Practice session not found');
	}

	const back = resolvePath(studentPath(classroom.id, student.id));
	return {
		student,
		review,
		imageBase: questionImageBase(locals.supabase),
		back,
		trail: [{ label: student.name, href: back }],
		title: review.run.stage.name
	};
};
