import { listOrganizations, saveOrganization } from '#lib/server/organizations.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every organization on the platform. Only an admin reaches the page, and the
 * database lets only an admin create one, so the action checks what was
 * posted and leaves who may post it to row level security.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { organizations: await listOrganizations(locals.supabase) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => saveOrganization(locals.supabase, await request.formData())
};
