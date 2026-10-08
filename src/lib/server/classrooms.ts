import { error } from '@sveltejs/kit';
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
	 * When the classroom was archived; null while it is live. Only a manager
	 * is ever handed an archived classroom: the database hides it from its
	 * teachers and students.
	 */
	archivedAt: string | null;
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
 * level security returns every classroom of a manager's organization, archived
 * ones included, the live classrooms a teacher teaches, and the live
 * classrooms a student is enrolled in.
 */
export async function listClassrooms(supabase: Supabase, role: Role): Promise<Classroom[]> {
	const { data, error } = await supabase
		.from('classrooms')
		.select(
			`id, name, grade_level_id, subject_id, cover_image_path, archived_at,
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
		archivedAt: row.archived_at,
		counts:
			role === 'student'
				? null
				: {
						teachers: row.classroom_teachers[0]?.count ?? 0,
						students: row.classroom_students[0]?.count ?? 0
					}
	}));
}

/**
 * The classroom named in an address, resolved against the classrooms the
 * person can reach. The database already refuses to return anyone else's, so
 * a miss means a mistyped link or one shared from another account, and the
 * error page says so rather than showing an empty classroom.
 */
export function findClassroom(classrooms: Classroom[], classroomId: string): Classroom {
	const classroom = classrooms.find((item) => item.id === classroomId);
	if (!classroom) error(404, 'Classroom not found');
	return classroom;
}

/** How many different students these classrooms hold: one enrolled in two of them counts once. */
export async function countStudents(supabase: Supabase, classroomIds: string[]): Promise<number> {
	if (classroomIds.length === 0) return 0;

	const { data, error } = await supabase
		.from('classroom_students')
		.select('student_id')
		.in('classroom_id', classroomIds);
	if (error) throw error;

	return new Set(data.map((row) => row.student_id)).size;
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

/** One student of a classroom, or null when the classroom has no such student. */
export async function getClassroomStudent(
	supabase: Supabase,
	classroomId: string,
	studentId: string
): Promise<ClassroomStudent | null> {
	const { data, error } = await supabase
		.from('classroom_students')
		.select(`student_profiles (${STUDENT_COLUMNS})`)
		.eq('classroom_id', classroomId)
		.eq('student_id', studentId)
		.maybeSingle();
	if (error) throw error;

	return data ? toStudent(data.student_profiles) : null;
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
