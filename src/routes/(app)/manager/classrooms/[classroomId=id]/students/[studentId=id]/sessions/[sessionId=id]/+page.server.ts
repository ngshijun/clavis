import { readSession } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** One finished practice session of a student of the classroom, as the student was shown it marked. */
export const load: PageServerLoad = ({ locals, params }) =>
	readSession(locals.supabase, 'manager', params);
