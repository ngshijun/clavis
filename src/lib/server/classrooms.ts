import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import type { Role } from '#lib/roles.js';

type Supabase = SupabaseClient<Database>;

export const CLASSROOM_IMAGES = 'classroom-images';

export interface Classroom {
	id: string;
	name: string;
	gradeLevelId: string;
	gradeLevelName: string;
	subjectId: string;
	subjectName: string;
	/** Public URL of the cover image; null when the classroom has none. */
	coverUrl: string | null;
	/**
	 * Roster sizes, present for staff only. A student's membership rows are
	 * filtered down to their own, so a count read as a student would be wrong.
	 */
	counts: { teachers: number; students: number } | null;
}

export interface ClassroomStudent {
	id: string;
	name: string;
	username: string | null;
	gradeLevelName: string | null;
}

export interface ClassroomTeacher {
	id: string;
	name: string;
	email: string;
}

export interface GradeLevelOption {
	id: string;
	name: string;
	subjects: { id: string; name: string }[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * The classrooms the signed-in person can reach. No filter is needed: row
 * level security returns every classroom of a manager's organization, the
 * classrooms a teacher teaches, and the classrooms a student is enrolled in.
 */
export async function listClassrooms(supabase: Supabase, role: Role): Promise<Classroom[]> {
	const { data, error } = await supabase
		.from('classrooms')
		.select(
			`id, name, grade_level_id, subject_id, cover_image_path,
			grade_levels (name), subjects (name),
			classroom_teachers (count), classroom_students (count)`
		)
		.order('name');
	if (error) throw error;

	return data.map((row) => ({
		id: row.id,
		name: row.name,
		gradeLevelId: row.grade_level_id,
		gradeLevelName: row.grade_levels.name,
		subjectId: row.subject_id,
		subjectName: row.subjects.name,
		coverUrl: row.cover_image_path
			? supabase.storage.from(CLASSROOM_IMAGES).getPublicUrl(row.cover_image_path).data.publicUrl
			: null,
		counts:
			role === 'student'
				? null
				: {
						teachers: row.classroom_teachers[0]?.count ?? 0,
						students: row.classroom_students[0]?.count ?? 0
					}
	}));
}

/** Grade levels with their subjects, in curriculum order, for the classroom form. */
export async function listGradeLevels(supabase: Supabase): Promise<GradeLevelOption[]> {
	const { data, error } = await supabase
		.from('grade_levels')
		.select('id, name, subjects (id, name, display_order)')
		.order('display_order')
		.order('display_order', { referencedTable: 'subjects' });
	if (error) throw error;

	return data.map((grade) => ({
		id: grade.id,
		name: grade.name,
		subjects: grade.subjects.map(({ id, name }) => ({ id, name }))
	}));
}

const STUDENT_COLUMNS =
	'id, username, grade_levels (name), profiles!student_profiles_id_fkey (name)';

function toStudent(row: {
	id: string;
	username: string | null;
	grade_levels: { name: string } | null;
	profiles: { name: string };
}): ClassroomStudent {
	return {
		id: row.id,
		name: row.profiles.name,
		username: row.username,
		gradeLevelName: row.grade_levels?.name ?? null
	};
}

export async function listClassroomStudents(
	supabase: Supabase,
	classroomId: string
): Promise<ClassroomStudent[]> {
	const { data, error } = await supabase
		.from('classroom_students')
		.select(`student_profiles (${STUDENT_COLUMNS})`)
		.eq('classroom_id', classroomId);
	if (error) throw error;

	return data.map((row) => toStudent(row.student_profiles)).sort(byName);
}

export async function listClassroomTeachers(
	supabase: Supabase,
	classroomId: string
): Promise<ClassroomTeacher[]> {
	const { data, error } = await supabase
		.from('classroom_teachers')
		.select('profiles!classroom_teachers_teacher_id_fkey (id, name, email)')
		.eq('classroom_id', classroomId);
	if (error) throw error;

	return data.map((row) => row.profiles).sort(byName);
}

/** Every student of the caller's organization: any of them can join a classroom. */
export async function listOrganizationStudents(supabase: Supabase): Promise<ClassroomStudent[]> {
	const { data, error } = await supabase.from('student_profiles').select(STUDENT_COLUMNS);
	if (error) throw error;

	return data.map(toStudent).sort(byName);
}

export async function listOrganizationTeachers(
	supabase: Supabase,
	organizationId: string
): Promise<ClassroomTeacher[]> {
	const { data, error } = await supabase
		.from('profiles')
		.select('id, name, email')
		.eq('user_type', 'teacher')
		.eq('organization_id', organizationId)
		.order('name');
	if (error) throw error;

	return data;
}
