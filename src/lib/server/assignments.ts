import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';

type Supabase = SupabaseClient<Database>;

/** One student an assignment was given to. */
export interface AssignedStudent {
	studentId: string;
	/** When they did it: when they first finished its stage after it was assigned. Null until then. */
	doneAt: string | null;
}

/** A stage a teacher has assigned in a classroom. */
export interface Assignment {
	id: string;
	stageId: string;
	assignedAt: string;
	/** The moment it is due; null for none. It closes nothing. */
	dueAt: string | null;
	/**
	 * Who it was given to, as far as the reader may see: everyone for the
	 * classroom's staff, and for a student themselves alone.
	 */
	students: AssignedStudent[];
}

const COLUMNS = `id, stage_id, due_at, created_at,
	assignment_students (student_id, practice_sessions (completed_at))`;

function toAssignment(row: {
	id: string;
	stage_id: string;
	due_at: string | null;
	created_at: string;
	assignment_students: {
		student_id: string;
		practice_sessions: { completed_at: string | null } | null;
	}[];
}): Assignment {
	return {
		id: row.id,
		stageId: row.stage_id,
		assignedAt: row.created_at,
		dueAt: row.due_at,
		students: row.assignment_students.map((student) => ({
			studentId: student.student_id,
			doneAt: student.practice_sessions?.completed_at ?? null
		}))
	};
}

/**
 * What has been assigned in a classroom that the caller may read, the latest
 * first: all of it for the classroom's staff, and for a student what was
 * given to them.
 */
export async function listAssignments(
	supabase: Supabase,
	classroomId: string
): Promise<Assignment[]> {
	const { data, error } = await supabase
		.from('assignments')
		.select(COLUMNS)
		.eq('classroom_id', classroomId)
		.order('created_at', { ascending: false });
	if (error) throw error;

	return data.map(toAssignment);
}

/** One assignment of a classroom with the name of whoever assigned it, or null when the classroom has no such assignment. */
export async function getAssignment(
	supabase: Supabase,
	classroomId: string,
	assignmentId: string
): Promise<(Assignment & { assignedBy: string | null }) | null> {
	const { data, error } = await supabase
		.from('assignments')
		.select(`${COLUMNS}, profiles (name)`)
		.eq('classroom_id', classroomId)
		.eq('id', assignmentId)
		.maybeSingle();
	if (error) throw error;

	return data ? { ...toAssignment(data), assignedBy: data.profiles?.name ?? null } : null;
}

/**
 * Assigns a stage in a classroom to some of its students, as the signed-in
 * teacher. The database refuses unless they teach the classroom, the stage
 * can be practised there and every student named is a student of it.
 */
export async function assignStage(
	supabase: Supabase,
	assignment: { classroomId: string; stageId: string; studentIds: string[]; dueAt: string | null }
): Promise<void> {
	const { error } = await supabase.rpc('assign_stage', {
		p_classroom_id: assignment.classroomId,
		p_stage_id: assignment.stageId,
		p_student_ids: assignment.studentIds,
		// Null is "no due date", which the generated types do not know the function takes.
		p_due_at: assignment.dueAt as string
	});
	if (error) throw error;
}

/**
 * Deletes an assignment of a classroom. The students' practice is left as it
 * is. False when nothing was deleted: there is no such assignment, or the
 * caller is not a teacher of the classroom.
 */
export async function deleteAssignment(
	supabase: Supabase,
	classroomId: string,
	assignmentId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('assignments')
		.delete()
		.eq('classroom_id', classroomId)
		.eq('id', assignmentId)
		.select('id');
	if (error) throw error;

	return data.length > 0;
}

/**
 * How many assignments a student has yet to do, by the classroom's id. A
 * classroom with none is not in it.
 */
export async function countToDo(
	supabase: Supabase,
	studentId: string
): Promise<Record<string, number>> {
	const { data, error } = await supabase
		.from('assignment_students')
		.select('classroom_id')
		.eq('student_id', studentId)
		.is('session_id', null);
	if (error) throw error;

	const counts: Record<string, number> = {};
	for (const row of data) counts[row.classroom_id] = (counts[row.classroom_id] ?? 0) + 1;
	return counts;
}

// ---- A teacher's notifications ---------------------------------------------

/** A student has done an assignment the teacher made. */
export interface Notice {
	assignmentId: string;
	classroomId: string;
	studentId: string;
	studentName: string;
	stageName: string;
	/** The score of the session that did it. */
	marks: number;
	total: number;
	doneAt: string;
	seen: boolean;
}

export interface Notifications {
	/** How many the teacher has not seen, counted beyond the ones listed. */
	unread: number;
	/** The latest, newest first. */
	latest: Notice[];
}

/** The signed-in teacher's notifications. */
export async function listNotifications(supabase: Supabase): Promise<Notifications> {
	const { data, error } = await supabase.rpc('list_notifications');
	if (error) throw error;

	return {
		unread: data[0]?.unread ?? 0,
		latest: data.map((row) => ({
			assignmentId: row.assignment_id,
			classroomId: row.classroom_id,
			studentId: row.student_id,
			studentName: row.student_name,
			stageName: row.stage_name,
			marks: row.marks,
			total: row.total,
			doneAt: row.done_at,
			seen: row.seen
		}))
	};
}

/** Marks the signed-in teacher's notifications as seen: those of one assignment, or all of them. */
export async function markNotificationsSeen(
	supabase: Supabase,
	assignmentId: string | null
): Promise<void> {
	const { error } = await supabase.rpc('mark_notifications_seen', {
		// Null is "all of them", which the generated types do not know the function takes.
		p_assignment_id: assignmentId as string
	});
	if (error) throw error;
}
