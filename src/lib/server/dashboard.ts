import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod';
import type { Database } from '#lib/database.types.js';
import {
	averagesOf,
	bandsOf,
	classroomSummaryOf,
	peopleOf,
	pointsOf,
	progressOf,
	starTallyOf,
	strugglingOf,
	type Enrolment,
	type PointScore,
	type StageBest
} from '#lib/items/dashboard.js';
import { dashboardHref, type StaffRole } from '#lib/navigation.js';
import { listAssignments } from '#lib/server/assignments.js';
import type { Classroom } from '#lib/server/classrooms.js';

type Supabase = SupabaseClient<Database>;

/**
 * What a dashboard reads of some classrooms, or for null of every one the
 * caller follows: those a teacher teaches, and every one of a manager's
 * organization. The database answers only for the live classrooms among
 * them, and only of the students still in them (P42a, P43a, P45a).
 */

/** The classrooms asked for, as the functions take them. */
function asked(classroomIds: string[] | null) {
	// Null is every classroom the caller follows, which the generated types do not know the functions take.
	return { p_classroom_ids: classroomIds as string[] };
}

/** Every student of the classrooms, once for each they are in. */
export async function listEnrolments(
	supabase: Supabase,
	classroomIds: string[] | null
): Promise<Enrolment[]> {
	const { data, error } = await supabase.rpc('dashboard_students', asked(classroomIds));
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
	classroomIds: string[] | null
): Promise<StageBest[]> {
	const { data, error } = await supabase.rpc('dashboard_stage_bests', asked(classroomIds));
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
	classroomIds: string[] | null
): Promise<PointScore[]> {
	const { data, error } = await supabase.rpc('dashboard_learning_points', asked(classroomIds));
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
export async function listWeeks(
	supabase: Supabase,
	classroomIds: string[] | null
): Promise<Week[]> {
	const { data, error } = await supabase.rpc('dashboard_weeks', asked(classroomIds));
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
	classroomIds: string[] | null
): Promise<Activity[]> {
	const { data, error } = await supabase.rpc('dashboard_activity', asked(classroomIds));
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

/**
 * A dashboard: how the classrooms a teacher teaches, or a manager's
 * organization has, are doing, all of them or the one named. Everything is
 * worked out here from what the database hands over, and only what the page
 * shows is returned. It is null when the classroom named is not one of them.
 *
 * `reach` is the live classrooms the person follows. It is awaited alongside
 * the reads, which start from the address alone.
 */
async function readDashboard(
	supabase: Supabase,
	reach: Promise<Classroom[]>,
	chosenId: string | null
) {
	const ids = chosenId ? [chosenId] : null;
	const [classrooms, enrolments, bests, scores, assignments, weeks, activity] = await Promise.all([
		reach,
		listEnrolments(supabase, ids),
		listStageBests(supabase, ids),
		listPointScores(supabase, ids),
		listAssignments(supabase, ids),
		listWeeks(supabase, ids),
		listActivity(supabase, ids)
	]);
	const chosen = classrooms.find((each) => each.id === chosenId);
	if (chosenId && !chosen) return null;

	// A manager is handed the assignments of archived classrooms too, and a dashboard is of the live ones.
	const live = new Set(classrooms.map((each) => each.id));
	const given = assignments.filter((each) => live.has(each.classroomId));

	const now = Date.now();
	const averages = averagesOf(bests);
	const points = pointsOf(scores, enrolments);
	const struggling = strugglingOf(enrolments, averages, scores);
	const read = { enrolments, averages, scores, given, struggling };

	return {
		/** The live classrooms the dashboard can be of. */
		reach: classrooms,
		classroomId: chosen?.id ?? null,
		people: peopleOf(enrolments),
		points,
		bands: bandsOf(points),
		struggling,
		progress: progressOf(given, now),
		tally: starTallyOf(bests),
		weeks,
		activity,
		// One classroom is the whole page, so only several are summed up one by one.
		summaries: chosen
			? []
			: classrooms.map((classroom) => ({
					classroom,
					summary: classroomSummaryOf(classroom.id, read, now)
				}))
	};
}

/** What a dashboard page shows. */
export type Dashboard = NonNullable<Awaited<ReturnType<typeof readDashboard>>>;

/**
 * The load of a dashboard page, a teacher's or a manager's: how the
 * classrooms the layout handed them are doing, all of them or the one the
 * address names.
 */
export async function loadDashboard(
	role: StaffRole,
	{
		locals,
		url,
		parent
	}: Pick<ServerLoadEvent, 'locals' | 'url'> & {
		parent: () => Promise<{ classrooms: Classroom[] }>;
	}
) {
	const named = z.guid().safeParse(url.searchParams.get('classroom'));
	const dashboard = await readDashboard(
		locals.supabase,
		// A manager is handed their archived classrooms too, and a dashboard is of the live ones.
		parent().then(({ classrooms }) => classrooms.filter((each) => each.archivedAt === null)),
		named.success ? named.data : null
	);
	// A classroom the person does not follow shows them every one they do.
	if (!dashboard) redirect(307, dashboardHref(role, null));

	return { wide: true, ...dashboard };
}
