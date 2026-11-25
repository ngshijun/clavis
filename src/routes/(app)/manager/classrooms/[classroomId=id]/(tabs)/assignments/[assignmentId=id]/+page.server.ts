import { readAssignment } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** One assignment of a classroom, with every student it was given to, for a manager to read. */
export const load: PageServerLoad = ({ locals, params }) =>
	readAssignment(locals.supabase, params.classroomId, params.assignmentId);
