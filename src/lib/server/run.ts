import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '#lib/database.types.js';
import { keyOf, type AnswerKey } from '#lib/items/key.js';
import type { ItemPayload } from '#lib/items/payload.js';
import { standingOf, type Standing } from '#lib/items/progress.js';
import type { Answers, Marked, Run } from '#lib/items/run.js';
import type { ItemResponse } from '#lib/items/served.js';
import type { Classroom } from './classrooms.js';
import {
	getSubjectStages,
	QUESTION_IMAGES,
	type SubjectStages,
	type TopicStages
} from './practice.js';

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

/** One finished session of a stage: what it scored, and when it was finished. */
export interface Attempt extends Score {
	id: string;
	completedAt: string;
}

/** Finished sessions, by the student's id and then the stage's, the latest first. */
export type ClassroomAttempts = Record<string, Record<string, Attempt[]>>;

/**
 * Every finished session in a classroom that the caller may read: a
 * student's own, and every student's for a teacher of the classroom. A
 * student or a stage with none is not in it.
 */
async function classroomAttempts(supabase: Supabase, classroomId: string) {
	const { data, error } = await supabase
		.from('practice_sessions')
		.select('id, student_id, stage_id, marks, total_questions, completed_at')
		.eq('classroom_id', classroomId)
		.not('completed_at', 'is', null)
		.order('completed_at', { ascending: false });
	if (error) throw error;

	const attempts: ClassroomAttempts = {};
	for (const row of data) {
		if (!row.completed_at) continue;
		((attempts[row.student_id] ??= {})[row.stage_id] ??= []).push({
			id: row.id,
			marks: row.marks,
			total: row.total_questions,
			completedAt: row.completed_at
		});
	}
	return attempts;
}

/** Where each student stands on each stage they have practised, by the student's id and then the stage's. */
export type ClassroomStandings = Record<string, Record<string, Standing<Attempt>>>;

/**
 * Where every student stands in a classroom, from its finished sessions. It
 * is what a page about the whole class is sent: a student's every attempt
 * stays on the server until their own page asks for it.
 */
export function standingsOf(attempts: ClassroomAttempts): ClassroomStandings {
	const standings: ClassroomStandings = {};
	for (const [studentId, stages] of Object.entries(attempts)) {
		for (const [stageId, sessions] of Object.entries(stages)) {
			const standing = standingOf(sessions);
			if (standing) (standings[studentId] ??= {})[stageId] = standing;
		}
	}
	return standings;
}

/** The stages a classroom can practise: those of its subject, topic by topic. */
export async function classroomTopics(
	supabase: Supabase,
	classroom: Classroom
): Promise<TopicStages[]> {
	const subject = await getSubjectStages(supabase, classroom.subjectId);
	if (!subject) error(404, 'Subject not found');

	return playableTopics(subject);
}

/**
 * A classroom's practice: the stages it can practise and the finished
 * sessions on record there. The sessions are the classroom's own: the same
 * stage practised in another classroom is not among them.
 */
export async function classroomPractice(
	supabase: Supabase,
	classroom: Classroom
): Promise<{ topics: TopicStages[]; attempts: ClassroomAttempts }> {
	const [topics, attempts] = await Promise.all([
		classroomTopics(supabase, classroom),
		classroomAttempts(supabase, classroom.id)
	]);
	return { topics, attempts };
}

/**
 * The topics of a subject as a pupil is offered them. A stage with no
 * question cannot be practised, and a topic left with no stage is not shown.
 */
function playableTopics(subject: SubjectStages): TopicStages[] {
	return subject.topics
		.map((topic) => ({
			...topic,
			stages: topic.stages.filter((stage) => stage.questionCount > 0)
		}))
		.filter((topic) => topic.stages.length > 0);
}

// ---- A finished session, read back ------------------------------------------

/** A finished practice session as the page a pupil is shown when they finish. */
export interface SessionReview {
	studentId: string;
	classroomId: string;
	completedAt: string;
	/** The stage as it stands now, dealt the same way every time the session is read. */
	run: Run;
	/** The answers that were handed in. */
	answers: Answers;
	/** The score on record, and how each question the session answered is marked. */
	marked: Marked;
	/**
	 * The right answer to each question, by the question's id, for a reader
	 * who may see it: the staff of the session's classroom. Undefined for
	 * the session's student, who is never shown a right answer.
	 */
	rightAnswers?: Record<string, AnswerKey>;
}

/**
 * A finished practice session, or null when there is none the caller may
 * read. The database hands it to the session's student and to the staff of
 * its classroom, and to the staff alone the questions' answer keys with it.
 * Of a key only the right answer goes on from here.
 */
export async function reviewPracticeSession(
	supabase: Supabase,
	sessionId: string
): Promise<SessionReview | null> {
	const { data, error } = await supabase.rpc('review_practice_session', {
		p_session_id: sessionId
	});
	if (error) throw error;
	if (!data) return null;

	const review = data as unknown as {
		student_id: string;
		classroom_id: string;
		completed_at: string;
		run: Run;
		answers: ({ question_id: string } & ItemResponse)[];
		marked: Marked;
		key: Record<string, ItemPayload> | null;
	};
	return {
		studentId: review.student_id,
		classroomId: review.classroom_id,
		completedAt: review.completed_at,
		run: review.run,
		answers: Object.fromEntries(
			review.answers.map(({ question_id, ...answer }) => [question_id, answer])
		),
		marked: review.marked,
		rightAnswers:
			review.key === null
				? undefined
				: Object.fromEntries(
						Object.entries(review.key).map(([questionId, payload]) => [questionId, keyOf(payload)])
					)
	};
}
