import { listOrganizations } from '#lib/server/organizations.js';
import type { PageServerLoad } from './$types';

/** Every organization with its head counts, which the admin's dashboard adds up. */
export const load: PageServerLoad = async ({ locals }) => {
	return { organizations: await listOrganizations(locals.supabase) };
};
