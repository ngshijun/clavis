import { listGradeLevels, listOrganizationStudents } from '#lib/server/classrooms.js';
import { createPerson, resetPassword, setAccountClosed, updatePerson } from '#lib/server/people.js';
import type { Actions, PageServerLoad } from './$types';

/** The organization's students, those whose account is closed too, and the grade levels a new one can be in. */
export const load: PageServerLoad = async ({ locals }) => {
	const [students, gradeLevels] = await Promise.all([
		listOrganizationStudents(locals.supabase),
		listGradeLevels(locals.supabase)
	]);
	return { students, gradeLevels };
};

export const actions: Actions = {
	create: async ({ request, locals }) =>
		createPerson(locals.supabase, 'student', await request.formData()),

	update: async ({ request, locals }) =>
		updatePerson(locals.supabase, 'student', await request.formData()),

	resetPassword: async ({ request, locals }) =>
		resetPassword(locals.supabase, await request.formData()),

	setClosed: async ({ request, locals }) =>
		setAccountClosed(locals.supabase, await request.formData())
};
