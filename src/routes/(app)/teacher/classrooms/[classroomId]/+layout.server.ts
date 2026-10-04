import { findClassroom } from '#lib/server/classrooms.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent, params }) => {
	const { classrooms } = await parent();
	return { classroom: findClassroom(classrooms, params.classroomId) };
};
