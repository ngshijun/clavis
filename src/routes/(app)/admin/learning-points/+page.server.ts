import { fail } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { listCurriculum } from '#lib/server/curriculum.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import {
	deleteLearningPoint,
	listLearningPoints,
	saveLearningPoint
} from '#lib/server/learning-points.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every learning point, and the curriculum whose topics offer them. Only an
 * admin reaches the page, and the database lets only an admin change a
 * learning point, so the actions check what was posted and leave who may
 * post it to the database.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const [points, grades] = await Promise.all([
		listLearningPoints(locals.supabase),
		listCurriculum(locals.supabase)
	]);
	return { points, grades };
};

const idSchema = z.object({ id: z.guid() });

export const actions: Actions = {
	create: async ({ request, locals }) =>
		saveLearningPoint(locals.supabase, await request.formData()),

	edit: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = idSchema.safeParse(formValues(form));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		return saveLearningPoint(locals.supabase, form, parsed.data.id);
	},

	delete: async ({ request, locals }) => {
		const parsed = idSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await deleteLearningPoint(locals.supabase, parsed.data.id);
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
