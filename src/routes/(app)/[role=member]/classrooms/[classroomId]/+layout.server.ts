import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * The classroom named in the address, resolved against the classrooms the
 * person can reach. The database already refuses to return anyone else's, so
 * a miss here means a mistyped link or one shared from another account, and
 * the error page says so rather than showing an empty classroom.
 */
export const load: LayoutServerLoad = async ({ parent, params }) => {
	const { classrooms } = await parent();
	const classroom = classrooms.find((item) => item.id === params.classroomId);
	if (!classroom) error(404, 'Classroom not found');

	return { classroom };
};
