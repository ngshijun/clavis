import { readStudent } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** One student of a classroom, with their practice there. */
export const load: PageServerLoad = ({ locals, params }) =>
	readStudent(locals.supabase, params.classroomId, params.studentId);
