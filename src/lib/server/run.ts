import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '#lib/database.types.js';
import type { Marked, Run } from '#lib/items/run.js';
import { QUESTION_IMAGES } from './practice.js';

type Supabase = SupabaseClient<Database>;

/** What a stored picture's path is appended to, to get its public URL. */
export function questionImageBase(supabase: Supabase): string {
	return supabase.storage.from(QUESTION_IMAGES).getPublicUrl('').data.publicUrl;
}

/**
 * The answers a run posts when it is finished, as the list the database
 * marks; null when what was posted is not a list. The database reads the list
 * leniently, and what it cannot read earns nothing, so there is nothing more
 * to check here.
 */
export async function postedAnswers(request: Request): Promise<Json[] | null> {
	const posted = (await request.formData()).get('answers');
	try {
		const answers: unknown = JSON.parse(typeof posted === 'string' ? posted : '');
		return Array.isArray(answers) ? answers : null;
	} catch {
		return null;
	}
}

/**
 * A stage dealt out as a pupil gets it, for an admin to try. Each call deals
 * afresh: a stage in random order comes in a new order, and the lists inside
 * the questions are mixed again.
 */
export async function previewStage(supabase: Supabase, stageId: string): Promise<Run> {
	const { data, error } = await supabase.rpc('preview_stage', { p_stage_id: stageId });
	if (error) throw error;
	return data as unknown as Run;
}

/**
 * Marks a preview's answers. Nothing is recorded. Every question of the stage
 * comes back, the ones not answered with no marks, each with its mark and the
 * tips its answer earned. No right answer leaves the database.
 */
export async function markStagePreview(
	supabase: Supabase,
	stageId: string,
	answers: Json
): Promise<Marked> {
	const { data, error } = await supabase.rpc('mark_stage_preview', {
		p_stage_id: stageId,
		p_answers: answers
	});
	if (error) throw error;
	return data as unknown as Marked;
}

// ---- A pupil's practice, in a classroom ------------------------------------

export interface StagePlace {
	id: string;
	name: string;
	topic: { id: string; name: string };
}

/** A stage of a subject, with the topic it is in; null when the subject has no such stage. */
export async function findStage(
	supabase: Supabase,
	subjectId: string,
	stageId: string
): Promise<StagePlace | null> {
	const { data, error } = await supabase
		.from('stages')
		.select('id, name, topics!inner (id, name, subject_id)')
		.eq('id', stageId)
		.eq('topics.subject_id', subjectId)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;

	return { id: data.id, name: data.name, topic: { id: data.topics.id, name: data.topics.name } };
}

/**
 * A stage dealt out for the signed-in pupil to practise in a classroom. Each
 * call deals afresh. The database refuses unless they are a student of that
 * classroom and the stage is of its subject.
 */
export async function servePracticeStage(
	supabase: Supabase,
	classroomId: string,
	stageId: string
): Promise<Run> {
	const { data, error } = await supabase.rpc('serve_practice_stage', {
		p_classroom_id: classroomId,
		p_stage_id: stageId
	});
	if (error) throw error;
	return data as unknown as Run;
}

/**
 * Records the signed-in pupil's finished run of a stage in a classroom and
 * returns how it was marked. Every question of the stage counts, and one left
 * out earns nothing.
 */
export async function submitPracticeSession(
	supabase: Supabase,
	classroomId: string,
	stageId: string,
	answers: Json
): Promise<Marked> {
	const { data, error } = await supabase.rpc('submit_practice_session', {
		p_classroom_id: classroomId,
		p_stage_id: stageId,
		p_answers: answers
	});
	if (error) throw error;
	return data as unknown as Marked;
}

/** What a session scored: its marks out of its questions, at one mark a question. */
export interface Score {
	marks: number;
	total: number;
}

/**
 * What the signed-in pupil scored the last time they practised each stage in
 * a classroom, by the stage's id. A stage not practised there is not in it.
 * No filter by pupil is needed: a student reads only their own sessions.
 */
export async function lastScores(
	supabase: Supabase,
	classroomId: string
): Promise<Record<string, Score>> {
	const { data, error } = await supabase
		.from('practice_sessions')
		.select('stage_id, marks, total_questions')
		.eq('classroom_id', classroomId)
		.order('completed_at');
	if (error) throw error;

	// In the order they were done, so a later session replaces an earlier one.
	return Object.fromEntries(
		data.map((row) => [row.stage_id, { marks: row.marks, total: row.total_questions }])
	);
}
