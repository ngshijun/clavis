import { getClassroom } from '#lib/server/classrooms.js';
import { signedIn } from '#lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	return {
		classroom: await getClassroom(locals.supabase, signedIn(locals).role, params.classroomId)
	};
};
