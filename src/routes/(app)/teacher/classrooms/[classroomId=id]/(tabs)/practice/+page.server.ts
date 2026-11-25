import { assignAction } from '#lib/server/assignments.js';
import { readClass } from '#lib/server/staff.js';
import type { Actions, PageServerLoad } from './$types';

/** A classroom's practice as its teacher follows it. */
export const load: PageServerLoad = ({ locals, params }) =>
	readClass(locals.supabase, params.classroomId);

export const actions: Actions = { assign: assignAction };
