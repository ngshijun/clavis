import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { m } from '#lib/paraglide/messages.js';
import { unexpected } from '#lib/server/forms.js';
import {
	deleteOrganization,
	getOrganization,
	listOrganizationManagers,
	saveOrganization
} from '#lib/server/organizations.js';
import { createPerson } from '#lib/server/people.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * One organization: its managers, and what is in it, which is counted for
 * whoever is about to delete it. The organization's name is the page's own,
 * for the breadcrumb.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const [organization, managers] = await Promise.all([
		getOrganization(locals.supabase, params.organizationId),
		listOrganizationManagers(locals.supabase, params.organizationId)
	]);
	if (!organization) error(404, 'Not found');

	return { title: organization.name, organization, managers };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) =>
		createPerson(locals.supabase, 'manager', await request.formData(), params.organizationId),

	rename: async ({ request, locals, params }) =>
		saveOrganization(locals.supabase, await request.formData(), params.organizationId),

	/**
	 * Deletes the organization and everything in it. The name the person typed
	 * goes to the database, which deletes nothing unless it is the
	 * organization's name as it stands.
	 */
	delete: async ({ request, locals, params }) => {
		const name = (await request.formData()).get('name');
		if (typeof name !== 'string') return fail(400, { message: m.error_unexpected() });

		try {
			await deleteOrganization(locals.supabase, params.organizationId, name);
		} catch (cause) {
			const code =
				typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
			if (code === '22023') return fail(400, { message: m.organization_delete_mismatch() });
			return unexpected(cause);
		}
		redirect(303, resolve('admin/organizations'));
	}
};
