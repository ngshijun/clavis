import { redirect } from '@sveltejs/kit';
import { classroomPath, soleClassroom } from '#lib/navigation.js';
import { resolvePath } from '#lib/paths.js';
import type { PageServerLoad } from './$types';

/** A student's classrooms. A student with exactly one is sent straight into it. */
export const load: PageServerLoad = async ({ parent }) => {
	const { user, classrooms } = await parent();
	const sole = soleClassroom(user.role, classrooms);
	if (sole) redirect(307, resolvePath(classroomPath('student', sole.id)));
};
