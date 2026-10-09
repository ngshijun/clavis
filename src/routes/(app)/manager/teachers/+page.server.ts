import { error } from '@sveltejs/kit';
import { listOrganizationTeachers } from '#lib/server/classrooms.js';
import { createPerson, resetPassword } from '#lib/server/people.js';
import type { Actions, PageServerLoad } from './$types';

/** The organization's teachers. */
export const load: PageServerLoad = async ({ locals }) => {
	const organizationId = locals.user?.organizationId;
	if (!organizationId) error(403, 'Forbidden');

	return { teachers: await listOrganizationTeachers(locals.supabase, organizationId) };
};

export const actions: Actions = {
	create: async ({ request, locals }) =>
		createPerson(locals.supabase, 'teacher', await request.formData()),

	resetPassword: async ({ request, locals }) =>
		resetPassword(locals.supabase, await request.formData())
};
