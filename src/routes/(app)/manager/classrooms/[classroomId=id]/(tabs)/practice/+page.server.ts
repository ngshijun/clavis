import { readClass } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** A classroom's practice, for a manager to read. */
export const load: PageServerLoad = ({ locals, params }) =>
	readClass(locals.supabase, params.classroomId);
