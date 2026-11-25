import { assignAction } from '#lib/server/assignments.js';
import { readOverview } from '#lib/server/staff.js';
import type { Actions, PageServerLoad } from './$types';

/** What has been assigned in a classroom, with what assigning more takes. */
export const load: PageServerLoad = ({ locals, params }) =>
	readOverview(locals.supabase, params.classroomId);

export const actions: Actions = { assign: assignAction };
