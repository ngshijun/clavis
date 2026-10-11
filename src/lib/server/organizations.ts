import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod';
import type { Database } from '#lib/database.types.js';
import { m } from '#lib/paraglide/messages.js';
import { CLASSROOM_IMAGES } from '#lib/server/classrooms.js';
import { formValues, unexpected } from '#lib/server/forms.js';

type Supabase = SupabaseClient<Database>;

/** A tuition center: the tenant every account but an admin's belongs to. */
export interface Organization {
	id: string;
	name: string;
}

/** An organization with how much is in it: its accounts of each kind and its classrooms, archived ones too. */
export interface OrganizationSummary extends Organization {
	managerCount: number;
	teacherCount: number;
	studentCount: number;
	classroomCount: number;
}

export interface OrganizationManager {
	id: string;
	name: string;
	email: string;
}

/**
 * The counts are made by the database, one for each role, so no account is
 * read to be counted.
 */
const SUMMARY = `id, name, managers:profiles (count), teachers:profiles (count),
	students:profiles (count), classrooms (count)`;

type Counted = { count: number }[];

function toSummary(row: {
	id: string;
	name: string;
	managers: Counted;
	teachers: Counted;
	students: Counted;
	classrooms: Counted;
}): OrganizationSummary {
	return {
		id: row.id,
		name: row.name,
		managerCount: row.managers[0]?.count ?? 0,
		teacherCount: row.teachers[0]?.count ?? 0,
		studentCount: row.students[0]?.count ?? 0,
		classroomCount: row.classrooms[0]?.count ?? 0
	};
}

/** Every organization, by name, each with what is in it. Only an admin is shown them all. */
export async function listOrganizations(supabase: Supabase): Promise<OrganizationSummary[]> {
	const { data, error } = await supabase
		.from('organizations')
		.select(SUMMARY)
		.eq('managers.user_type', 'manager')
		.eq('teachers.user_type', 'teacher')
		.eq('students.user_type', 'student')
		.order('name');
	if (error) throw error;

	return data.map(toSummary);
}

/** One organization with what is in it, or null when there is none the caller may read. */
export async function getOrganization(
	supabase: Supabase,
	organizationId: string
): Promise<OrganizationSummary | null> {
	const { data, error } = await supabase
		.from('organizations')
		.select(SUMMARY)
		.eq('managers.user_type', 'manager')
		.eq('teachers.user_type', 'teacher')
		.eq('students.user_type', 'student')
		.eq('id', organizationId)
		.maybeSingle();
	if (error) throw error;

	return data ? toSummary(data) : null;
}

const nameSchema = z.object({
	name: z
		.string({ error: () => m.organization_name_required() })
		.trim()
		.min(1, { error: () => m.organization_name_required() })
		.max(120, { error: () => m.organization_name_too_long() })
});

/**
 * Creates an organization from a posted form, or renames the one given, as an
 * admin: the database lets nobody else. A new organization starts empty, and
 * its first manager sets up the rest. It answers as a form action does:
 * nothing when it was saved, and otherwise a failure carrying the field to
 * put right.
 */
export async function saveOrganization(
	supabase: Supabase,
	form: FormData,
	organizationId?: string
) {
	const parsed = nameSchema.safeParse(formValues(form));
	if (!parsed.success) {
		return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
	}

	const { data, error } = organizationId
		? await supabase.from('organizations').update(parsed.data).eq('id', organizationId).select('id')
		: await supabase.from('organizations').insert(parsed.data).select('id');
	// Two organizations cannot share a name.
	if (error?.code === '23505') {
		return fail(409, { errors: { name: [m.organization_name_taken()] } });
	}
	if (error) return unexpected(error);
	// Row level security hides a row it will not let the caller change rather than raising.
	if (data.length === 0) return unexpected(new Error('The organization was not saved'));
}

/**
 * Deletes an organization and everything in it, as an admin: its classrooms
 * with all the practice recorded in them, and the accounts of its managers,
 * teachers and students. The database does it in one piece or not at all, and
 * only when handed the organization's name as it stands, which is what the
 * person was made to type.
 *
 * The covers of its classrooms are removed afterwards. One that could not be
 * removed is a stray file that nothing points at, so it is logged and the
 * delete stands.
 */
export async function deleteOrganization(
	supabase: Supabase,
	organizationId: string,
	name: string
): Promise<void> {
	const { data: covers, error } = await supabase.rpc('delete_organization', {
		p_organization_id: organizationId,
		p_name: name
	});
	if (error) throw error;

	if (covers.length > 0) {
		const { error: removeError } = await supabase.storage.from(CLASSROOM_IMAGES).remove(covers);
		if (removeError) console.error(removeError);
	}
}

/** An organization's managers, by name. */
export async function listOrganizationManagers(
	supabase: Supabase,
	organizationId: string
): Promise<OrganizationManager[]> {
	const { data, error } = await supabase
		.from('profiles')
		.select('id, name, email')
		.eq('user_type', 'manager')
		.eq('organization_id', organizationId)
		.order('name');
	if (error) throw error;

	return data;
}
