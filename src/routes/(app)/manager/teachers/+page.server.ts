import { error } from '@sveltejs/kit';
import { listOrganizationTeachers } from '#lib/server/classrooms.js';
import { createPerson, resetPassword, setAccountClosed, updatePerson } from '#lib/server/people.js';
import type { Actions, PageServerLoad } from './$types';

/** The organization's teachers, those whose account is closed too. */
export const load: PageServerLoad = async ({ locals }) => {
	const organizationId = locals.user?.organizationId;
	if (!organizationId) error(403, 'Forbidden');

	return { teachers: await listOrganizationTeachers(locals.supabase, organizationId) };
};

export const actions: Actions = {
	create: async ({ request, locals }) =>
		createPerson(locals.supabase, 'teacher', await request.formData()),

	update: async ({ request, locals }) =>
		updatePerson(locals.supabase, 'teacher', await request.formData()),

	resetPassword: async ({ request, locals }) =>
		resetPassword(locals.supabase, await request.formData()),

	setClosed: async ({ request, locals }) =>
		setAccountClosed(locals.supabase, await request.formData())
};
