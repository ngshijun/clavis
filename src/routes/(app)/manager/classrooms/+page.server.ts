import { error, fail } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import { readPicture, uploadPicture } from '#lib/server/images.js';
import { CLASSROOM_IMAGES, listGradeLevels } from '#lib/server/classrooms.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where a manager creates classrooms and puts them away. The classrooms
 * themselves come from the layout; the grade levels are for the form and for
 * the order the list is grouped in.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { gradeLevels: await listGradeLevels(locals.supabase) };
};

const classroomSchema = z.object({
	id: z.guid().optional(),
	name: z
		.string({ error: () => m.form_name_required() })
		.trim()
		.min(1, { error: () => m.form_name_required() })
		.max(120, { error: () => m.form_name_too_long() }),
	gradeLevelId: z.guid({ error: () => m.form_grade_required() }),
	subjectId: z.guid({ error: () => m.form_subject_required() }),
	removeCover: z.stringbool().optional()
});

export const actions: Actions = {
	/**
	 * Creates or updates a classroom, cover included. The cover is stored under
	 * the classroom's id, which is what its upload policy checks, so a new
	 * classroom's row is inserted before its cover is uploaded, and taken back
	 * out if the upload then fails: a save either happens whole or not at all.
	 */
	save: async ({ request, locals }) => {
		const { supabase, user } = locals;
		if (!user?.organizationId) error(403, 'Forbidden');

		const form = await request.formData();
		const parsed = classroomSchema.safeParse(formValues(form));
		if (!parsed.success) {
			return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
		}
		// Refused before a row is written: a file that is not a picture the bucket takes.
		const cover = await readPicture(form.get('cover'));
		if (cover === null) return fail(400, { errors: { cover: [m.form_cover_invalid()] } });
		const { name, gradeLevelId, subjectId, removeCover } = parsed.data;
		const fields = { name, grade_level_id: gradeLevelId, subject_id: subjectId };

		const existing = parsed.data.id;
		let id: string;
		let previousCover: string | null = null;

		if (existing) {
			const { data, error: readError } = await supabase
				.from('classrooms')
				.select('cover_image_path')
				.eq('id', existing)
				.single();
			if (readError) return unexpected(readError);
			id = existing;
			previousCover = data.cover_image_path;
		} else {
			const { data, error: insertError } = await supabase
				.from('classrooms')
				.insert({ ...fields, organization_id: user.organizationId, created_by: user.id })
				.select('id')
				.single();
			if (insertError) return unexpected(insertError);
			id = data.id;
		}

		let nextCover = removeCover ? null : previousCover;
		if (cover) {
			try {
				nextCover = await uploadPicture(supabase, CLASSROOM_IMAGES, id, cover);
			} catch (uploadError) {
				if (!existing) await supabase.from('classrooms').delete().eq('id', id);
				return unexpected(uploadError);
			}
		}

		// Row level security hides a row it will not let you change rather than raising, so an
		// update that touched nothing is a failure, not a success.
		const { data: updated, error: updateError } = await supabase
			.from('classrooms')
			.update({ ...fields, cover_image_path: nextCover })
			.eq('id', id)
			.select('id');
		if (updateError) return unexpected(updateError);
		if (updated.length === 0) return unexpected(new Error(`Classroom ${id} was not updated`));

		// Only once the row no longer points at it is the replaced image safe to delete.
		if (previousCover && previousCover !== nextCover) {
			const { error: removeError } = await supabase.storage
				.from(CLASSROOM_IMAGES)
				.remove([previousCover]);
			if (removeError) console.error(removeError);
		}
	},

	/**
	 * Archives a classroom or restores it. Archived, it is reached only by the
	 * organization's managers, and the database refuses every change to it but
	 * this one and its deletion.
	 */
	archive: async ({ request, locals }) => {
		const parsed = z
			.object({ id: z.guid(), archived: z.stringbool() })
			.safeParse(formValues(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { id, archived } = parsed.data;

		// The database keeps its own time for the moment of archiving.
		const { data: updated, error: updateError } = await locals.supabase
			.from('classrooms')
			.update({ archived_at: archived ? new Date().toISOString() : null })
			.eq('id', id)
			.select('id');
		if (updateError) return unexpected(updateError);
		if (updated.length === 0) return unexpected(new Error(`Classroom ${id} was not updated`));
	},

	/**
	 * Deletes an archived classroom, and with it its rosters and all the
	 * practice recorded in it. A live classroom is not deleted: the database
	 * refuses, so it has to be put away first. The cover goes first: its delete
	 * policy asks whether the caller manages the classroom the image belongs to,
	 * which can only be answered while the row still exists.
	 */
	delete: async ({ request, locals }) => {
		const { supabase } = locals;
		const id = z.guid().safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { message: m.error_unexpected() });

		const { data: classroom, error: readError } = await supabase
			.from('classrooms')
			.select('cover_image_path, archived_at')
			.eq('id', id.data)
			.single();
		if (readError) return unexpected(readError);
		// Checked before the cover is removed, so a refused delete leaves the classroom whole.
		if (classroom.archived_at === null) return fail(400, { message: m.error_unexpected() });

		if (classroom.cover_image_path) {
			const { error: removeError } = await supabase.storage
				.from(CLASSROOM_IMAGES)
				.remove([classroom.cover_image_path]);
			if (removeError) return unexpected(removeError);
		}

		const { data: deleted, error: deleteError } = await supabase
			.from('classrooms')
			.delete()
			.eq('id', id.data)
			.select('id');
		if (deleteError) return unexpected(deleteError);
		if (deleted.length === 0) return unexpected(new Error(`Classroom ${id.data} was not deleted`));
	}
};
