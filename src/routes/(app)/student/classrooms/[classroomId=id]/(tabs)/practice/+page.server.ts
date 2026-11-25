import { ownPractice } from '#lib/server/run.js';
import { signedIn } from '#lib/server/session.js';
import type { PageServerLoad } from './$types';

/**
 * A classroom's practice: the stages of its subject, topic by topic, with
 * every time the student has finished each of them here.
 */
export const load: PageServerLoad = ({ locals, params }) =>
	ownPractice(locals.supabase, params.classroomId, signedIn(locals).id);
