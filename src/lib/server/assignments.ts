import type { SupabaseClient } from '@supabase/supabase-js';
import { fail, type Action } from '@sveltejs/kit';
import * as z from 'zod';
import type { Database } from '#lib/database.types.js';
import { m } from '#lib/paraglide/messages.js';
import { formValues, unexpected } from '#lib/server/forms.js';

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
	classroomId: string;
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

const COLUMNS = `id, classroom_id, stage_id, due_at, created_at,
	assignment_students (student_id, practice_sessions (completed_at))`;

function toAssignment(row: {
	id: string;
	classroom_id: string;
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
		classroomId: row.classroom_id,
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
 * What has been assigned in some classrooms that the caller may read, or in
 * every one of them for null, the latest first: all of it for a classroom's
 * staff, and for a student what was given to them.
 */
export async function listAssignments(
	supabase: Supabase,
	classroomIds: string[] | null
): Promise<Assignment[]> {
	let query = supabase
		.from('assignments')
		.select(COLUMNS)
		.order('created_at', { ascending: false });
	if (classroomIds) query = query.in('classroom_id', classroomIds);
	const { data, error } = await query;
	if (error) throw error;

	return data.map(toAssignment);
}

/** A stage assigned to a student, as they read it: of who it was given to, only that they were. */
export type OwnAssignment = Omit<Assignment, 'students'> & {
	/** When they did it; null until then. */
	doneAt: string | null;
};

/**
 * What a student has been assigned in some of their classrooms, or in every
 * one of them for null, the latest first.
 */
export async function listOwnAssignments(
	supabase: Supabase,
	studentId: string,
	classroomIds: string[] | null
): Promise<OwnAssignment[]> {
	const assignments = await listAssignments(supabase, classroomIds);
	return assignments.map(({ students, ...assignment }) => ({
		...assignment,
		doneAt: students.find((student) => student.studentId === studentId)?.doneAt ?? null
	}));
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
async function assignStage(
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

const assignSchema = z.object({
	stageId: z.guid(),
	studentIds: z.array(z.guid()).min(1),
	// The end of the due day where the teacher is, which only their browser knows.
	dueAt: z.iso.datetime().optional()
});

/**
 * The form action `assign` of a page that assigns in the classroom of its
 * address: a stage to some of the classroom's students. The database checks
 * the rest: that the caller teaches the classroom, that the stage can be
 * practised there and that every student named is one of its own.
 */
export const assignAction: Action<{ classroomId: string }> = async ({
	request,
	locals,
	params
}) => {
	const form = await request.formData();
	const parsed = assignSchema.safeParse({
		...formValues(form),
		studentIds: form.getAll('studentId')
	});
	if (!parsed.success) return fail(400, { message: m.error_unexpected() });
	const { stageId, studentIds, dueAt = null } = parsed.data;
	if (dueAt && Date.parse(dueAt) <= Date.now()) {
		return fail(400, { message: m.assignment_due_past() });
	}

	try {
		await assignStage(locals.supabase, {
			classroomId: params.classroomId,
			stageId,
			studentIds,
			dueAt
		});
	} catch (cause) {
		return unexpected(cause);
	}
};

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
