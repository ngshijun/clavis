import { fail } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	addNode,
	deleteNode,
	listCurriculum,
	renameNode,
	reorderNodes,
	setCover
} from '#lib/server/curriculum.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import { readPicture } from '#lib/server/images.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * The curriculum's trunk on one page. Only an admin reaches it, and the
 * database lets only an admin change it, so the actions check what was posted
 * and leave who may post it to row level security.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { grades: await listCurriculum(locals.supabase) };
};

const kind = z.enum(['grade', 'subject', 'topic']);
const name = z
	.string({ error: () => m.row_name_invalid() })
	.trim()
	.min(1, { error: () => m.row_name_invalid() })
	.max(120, { error: () => m.row_name_invalid() });

/** A level, and for a subject or a topic, the row its rows sit under. */
const placement = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('grade') }),
	z.object({ kind: z.enum(['subject', 'topic']), parentId: z.guid() })
]);

const addSchema = placement.and(z.object({ name }));
const renameSchema = z.object({ kind, id: z.guid(), name });
const deleteSchema = z.object({ kind, id: z.guid() });
const reorderSchema = placement.and(z.object({ ids: z.array(z.guid()).min(1) }));
const coverSchema = z.object({
	kind: z.enum(['subject', 'topic']),
	id: z.guid(),
	remove: z.stringbool().optional()
});

/** A refusal the person can act on is told to them; anything else is logged. */
function refused(cause: unknown) {
	const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
	// A name must be unique among the rows it sits with.
	if (code === '23505') return fail(409, { message: m.row_name_taken() });
	// A classroom still points at the row, or at one beneath it.
	if (code === '23503') return fail(409, { message: m.curriculum_in_use() });
	return unexpected(cause);
}

/** The first thing wrong with what was posted, in words for the person who posted it. */
function invalid(error: z.ZodError) {
	return fail(400, { message: error.issues[0]?.message ?? m.error_unexpected() });
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const parsed = addSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return invalid(parsed.error);
		try {
			await addNode(locals.supabase, parsed.data, parsed.data.name);
		} catch (cause) {
			return refused(cause);
		}
	},

	rename: async ({ request, locals }) => {
		const parsed = renameSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return invalid(parsed.error);
		try {
			await renameNode(locals.supabase, parsed.data.kind, parsed.data.id, parsed.data.name);
		} catch (cause) {
			return refused(cause);
		}
	},

	delete: async ({ request, locals }) => {
		const parsed = deleteSchema.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await deleteNode(locals.supabase, parsed.data.kind, parsed.data.id);
		} catch (cause) {
			return refused(cause);
		}
	},

	reorder: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = reorderSchema.safeParse({ ...formValues(form), ids: form.getAll('ids') });
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		try {
			await reorderNodes(locals.supabase, parsed.data, parsed.data.ids);
		} catch (cause) {
			return refused(cause);
		}
	},

	/** Replaces the cover with the posted image, or removes it when asked to. */
	cover: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = coverSchema.safeParse(formValues(form));
		if (!parsed.success) return invalid(parsed.error);
		const { kind, id, remove } = parsed.data;
		const cover = remove ? null : await readPicture(form.get('cover'));
		// Neither a picture nor a removal, or a file that is not a picture the bucket takes.
		if (cover === undefined || (cover === null && !remove)) {
			return fail(400, { message: m.image_invalid() });
		}
		try {
			await setCover(locals.supabase, kind, id, cover);
		} catch (cause) {
			return refused(cause);
		}
	}
};
