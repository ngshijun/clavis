import { error, fail } from '@sveltejs/kit';
import * as z from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	CLASSROOM_IMAGES,
	listClassroomStudents,
	listClassroomTeachers,
	listGradeLevels,
	listOrganizationStudents,
	listOrganizationTeachers
} from '#lib/server/classrooms.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where a manager creates classrooms and assigns teachers and students into
 * them. `?members=<classroom id>` opens that classroom's roster, so the roster
 * has an address and loads only when asked for.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const { user, classrooms } = await parent();
	const { supabase } = locals;

	const membersOf = classrooms.find((item) => item.id === url.searchParams.get('members'));

	const [gradeLevels, members] = await Promise.all([
		listGradeLevels(supabase),
		membersOf && user.organizationId ? loadMembers(membersOf.id, user.organizationId) : null
	]);

	return { gradeLevels, members };

	async function loadMembers(classroomId: string, organizationId: string) {
		const [students, teachers, organizationStudents, organizationTeachers] = await Promise.all([
			listClassroomStudents(supabase, classroomId),
			listClassroomTeachers(supabase, classroomId),
			listOrganizationStudents(supabase),
			listOrganizationTeachers(supabase, organizationId)
		]);
		return { classroomId, students, teachers, organizationStudents, organizationTeachers };
	}
};

/** What the `classroom-images` bucket accepts; anything else is refused before a row is written. */
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_COVER_BYTES = 4 * 1024 * 1024;

const classroomSchema = z.object({
	id: z.guid().optional(),
	name: z
		.string({ error: () => m.form_name_required() })
		.trim()
		.min(1, { error: () => m.form_name_required() })
		.max(120, { error: () => m.form_name_too_long() }),
	gradeLevelId: z.guid({ error: () => m.form_grade_required() }),
	subjectId: z.guid({ error: () => m.form_subject_required() }),
	removeCover: z.stringbool().optional(),
	cover: z
		.file()
		.optional()
		// An empty file input still posts a zero-byte file.
		.transform((file) => (file && file.size > 0 ? file : undefined))
		.refine((file) => !file || (COVER_TYPES.includes(file.type) && file.size <= MAX_COVER_BYTES), {
			error: () => m.form_cover_invalid()
		})
});

const membershipSchema = z.object({
	classroomId: z.guid(),
	kind: z.enum(['students', 'teachers'])
});

/** What went wrong is logged for us; the person is told only that it did not work. */
function unexpected(cause: unknown) {
	console.error(cause);
	return fail(500, { message: m.error_unexpected() });
}

function values(form: FormData) {
	return Object.fromEntries([...form].filter(([, value]) => value !== ''));
}

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

		const parsed = classroomSchema.safeParse(values(await request.formData()));
		if (!parsed.success) {
			return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
		}
		const { name, gradeLevelId, subjectId, cover, removeCover } = parsed.data;
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
			const extension = cover.name.includes('.')
				? cover.name.slice(cover.name.lastIndexOf('.'))
				: '';
			const path = `${id}/${crypto.randomUUID()}${extension}`;
			const { error: uploadError } = await supabase.storage
				.from(CLASSROOM_IMAGES)
				.upload(path, cover, { cacheControl: '31536000', contentType: cover.type });
			if (uploadError) {
				if (!existing) await supabase.from('classrooms').delete().eq('id', id);
				return unexpected(uploadError);
			}
			nextCover = path;
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
	 * The cover goes first: its delete policy asks whether the caller manages the
	 * classroom the image belongs to, which can only be answered while the row
	 * still exists.
	 */
	delete: async ({ request, locals }) => {
		const { supabase } = locals;
		const id = z.guid().safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { message: m.error_unexpected() });

		const { data: classroom, error: readError } = await supabase
			.from('classrooms')
			.select('cover_image_path')
			.eq('id', id.data)
			.single();
		if (readError) return unexpected(readError);

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
	},

	addMembers: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = membershipSchema
			.extend({ ids: z.array(z.guid()).min(1) })
			.safeParse({ ...values(form), ids: form.getAll('ids') });
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { classroomId, kind, ids } = parsed.data;

		const { error: insertError } =
			kind === 'students'
				? await locals.supabase
						.from('classroom_students')
						.insert(ids.map((id) => ({ classroom_id: classroomId, student_id: id })))
				: await locals.supabase
						.from('classroom_teachers')
						.insert(ids.map((id) => ({ classroom_id: classroomId, teacher_id: id })));
		if (insertError) return unexpected(insertError);
	},

	removeMember: async ({ request, locals }) => {
		const parsed = membershipSchema
			.extend({ id: z.guid() })
			.safeParse(values(await request.formData()));
		if (!parsed.success) return fail(400, { message: m.error_unexpected() });
		const { classroomId, kind, id } = parsed.data;

		const { error: deleteError } =
			kind === 'students'
				? await locals.supabase
						.from('classroom_students')
						.delete()
						.eq('classroom_id', classroomId)
						.eq('student_id', id)
				: await locals.supabase
						.from('classroom_teachers')
						.delete()
						.eq('classroom_id', classroomId)
						.eq('teacher_id', id);
		if (deleteError) return unexpected(deleteError);
	}
};
