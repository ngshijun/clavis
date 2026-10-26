import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import type { Enrolment, PointScore, StageBest } from '#lib/items/dashboard.js';

type Supabase = SupabaseClient<Database>;

/**
 * What a teacher's dashboard reads of some of their classrooms. The database
 * answers only for the live classrooms among them that the caller teaches,
 * and only of the students still in them (P42a).
 */

/** Every student of the classrooms, once for each they are in. */
export async function listEnrolments(
	supabase: Supabase,
	classroomIds: string[]
): Promise<Enrolment[]> {
	const { data, error } = await supabase.rpc('dashboard_students', {
		p_classroom_ids: classroomIds
	});
	if (error) throw error;

	return data.map((row) => ({
		classroomId: row.classroom_id,
		studentId: row.student_id,
		name: row.name,
		thisWeek: row.this_week,
		lastWeek: row.last_week
	}));
}

/** Each student's best session on each stage they have practised. */
export async function listStageBests(
	supabase: Supabase,
	classroomIds: string[]
): Promise<StageBest[]> {
	const { data, error } = await supabase.rpc('dashboard_stage_bests', {
		p_classroom_ids: classroomIds
	});
	if (error) throw error;

	return data.map((row) => ({
		classroomId: row.classroom_id,
		studentId: row.student_id,
		stageId: row.stage_id,
		marks: row.marks,
		total: row.total
	}));
}

/** How each student does on each learning point, by the last questions they answered on it. */
export async function listPointScores(
	supabase: Supabase,
	classroomIds: string[]
): Promise<PointScore[]> {
	const { data, error } = await supabase.rpc('dashboard_learning_points', {
		p_classroom_ids: classroomIds
	});
	if (error) throw error;

	return data.map((row) => ({
		classroomId: row.classroom_id,
		studentId: row.student_id,
		pointId: row.learning_point_id,
		name: row.name,
		score: row.score
	}));
}

/** Practice in one of the last eight weeks: seven days back from now, week 0 the latest. */
export interface Week {
	weeksAgo: number;
	sessions: number;
	/** Their average share of the marks; null when there were none. */
	average: number | null;
}

/** The last eight weeks of practice, the earliest first. */
export async function listWeeks(supabase: Supabase, classroomIds: string[]): Promise<Week[]> {
	const { data, error } = await supabase.rpc('dashboard_weeks', { p_classroom_ids: classroomIds });
	if (error) throw error;

	return data
		.map((row) => ({ weeksAgo: row.weeks_ago, sessions: row.sessions, average: row.average }))
		.sort((a, b) => b.weeksAgo - a.weeksAgo);
}

/** A practice session lately finished. */
export interface Activity {
	sessionId: string;
	classroomId: string;
	studentId: string;
	studentName: string;
	topicName: string;
	stageName: string;
	marks: number;
	total: number;
	completedAt: string;
	/** Whether it did an assignment. */
	didAssignment: boolean;
}

/** The latest practice finished, newest first. */
export async function listActivity(
	supabase: Supabase,
	classroomIds: string[]
): Promise<Activity[]> {
	const { data, error } = await supabase.rpc('dashboard_activity', {
		p_classroom_ids: classroomIds
	});
	if (error) throw error;

	return data.map((row) => ({
		sessionId: row.session_id,
		classroomId: row.classroom_id,
		studentId: row.student_id,
		studentName: row.student_name,
		topicName: row.topic_name,
		stageName: row.stage_name,
		marks: row.marks,
		total: row.total,
		completedAt: row.completed_at,
		didAssignment: row.did_assignment
	}));
}
