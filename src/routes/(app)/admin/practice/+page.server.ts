import { listPracticeSubjects } from '#lib/server/practice.js';
import type { PageServerLoad } from './$types';

/**
 * Every grade level with its subjects. The load does not read the address's
 * query: which grade level is showing is the page's own business, so choosing
 * another one fetches nothing.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { grades: await listPracticeSubjects(locals.supabase) };
};
