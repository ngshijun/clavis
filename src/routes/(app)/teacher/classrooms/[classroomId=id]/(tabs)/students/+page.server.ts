import { readClass } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** A classroom's students, with where each stands on its stages: a row says what its student has done. */
export const load: PageServerLoad = ({ locals, params }) =>
	readClass(locals.supabase, params.classroomId);
