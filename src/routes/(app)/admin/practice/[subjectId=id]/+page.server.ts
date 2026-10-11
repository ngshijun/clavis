import { error, fail } from '@sveltejs/kit';
import * as z from 'zod';
import { practiceGradeHref } from '#lib/navigation.js';
import { m } from '#lib/paraglide/messages.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import {
	addStage,
	deleteStage,
	getSubjectStages,
	renameStage,
	reorderStages
} from '#lib/server/practice.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * One subject's stages, topic by topic. Only an admin reaches the page, and
 * the database lets only an admin change a stage, so the actions check what
 * was posted and leave who may post it to row level security.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const subject = await getSubjectStages(locals.supabase, params.subjectId);
	if (!subject) error(404, 'Subject not found');

	return {
		subject,
		// The grade level is a crumb of its own, and leads back to the subjects it was chosen from.
		trail: [{ label: subject.grade.name, href: practiceGradeHref(subject.grade.id) }],
		title: subject.name
	};
};

// The rows of this page are all stages; `kind` says so, as the row components post it.
const kind = z.literal('stage');
const name = z
	.string({ error: () => m.row_name_invalid() })
	.trim()
	.min(1, { error: () => m.row_name_invalid() })
	.max(120, { error: () => m.row_name_invalid() });

/** `parentId` is the topic the stages sit under. */
const addSchema = z.object({ kind, parentId: z.guid(), name });
const renameSchema = z.object({ kind, id: z.guid(), name });
const deleteSchema = z.object({ kind, id: z.guid() });
const reorderSchema = z.object({ kind, parentId: z.guid(), ids: z.array(z.guid()).min(1) });

/** The first thing wrong with what was posted, in words for the person who posted it. */
function invalid(error: z.ZodError) {
	return fail(400, { message: error.issues[0]?.message ?? m.error_unexpected() });
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const parsed = addSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return invalid(parsed.error);
		try {
			await addStage(locals.supabase, parsed.data.parentId, parsed.data.name);
		} catch (cause) {
			return unexpected(cause);
		}
	},

	rename: async ({ request, locals }) => {
		const parsed = renameSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return invalid(parsed.error);
		try {
			await renameStage(locals.supabase, parsed.data.id, parsed.data.name);
		} catch (cause) {
			return unexpected(cause);
		}
	},

	delete: async ({ request, locals }) => {
		const parsed = deleteSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await deleteStage(locals.supabase, parsed.data.id);
		} catch (cause) {
			return unexpected(cause);
		}
	},

	reorder: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = reorderSchema.safeParse({ ...formValues(form), ids: form.getAll('ids') });
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await reorderStages(locals.supabase, parsed.data.parentId, parsed.data.ids);
		} catch (cause) {
			return unexpected(cause);
		}
	}
};
