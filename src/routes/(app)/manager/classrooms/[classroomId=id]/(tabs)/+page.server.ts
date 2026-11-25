import { readOverview } from '#lib/server/staff.js';
import type { PageServerLoad } from './$types';

/** What has been assigned in a classroom, for a manager to read. */
export const load: PageServerLoad = ({ locals, params }) =>
	readOverview(locals.supabase, params.classroomId);
