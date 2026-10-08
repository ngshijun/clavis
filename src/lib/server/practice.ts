import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import { imagePaths, mapImagePaths, strayPicture, uploadKey } from '#lib/item-images.js';
import type { ImportPlan } from '#lib/items/import.js';
import type { Difficulty, ItemPayload } from '#lib/items/payload.js';
import type { PassageContent } from '#lib/passage.js';
import { CURRICULUM_IMAGES } from '#lib/server/curriculum.js';
import { uploadPicture, type Picture } from '#lib/server/images.js';
import { QUESTION_IMAGES, removeStagePictures, stageFolder } from '#lib/server/stage-pictures.js';

export { QUESTION_IMAGES };

type Supabase = SupabaseClient<Database>;

export const QUESTION_ORDERS = ['fixed', 'random'] as const;
/** Whether pupils get a stage's questions in the builder's order or shuffled. */
export type QuestionOrder = (typeof QUESTION_ORDERS)[number];

// ---- The subjects, by grade level -----------------------------------------

export interface PracticeSubject {
	id: string;
	name: string;
	/** Public URL of the cover image; null when there is none. */
	coverUrl: string | null;
	topicCount: number;
	stageCount: number;
	questionCount: number;
}

export interface PracticeGrade {
	id: string;
	name: string;
	subjects: PracticeSubject[];
}

/**
 * Every subject under its grade level, with how much practice it holds.
 *
 * Questions are counted by their id: the column that holds their answers cannot
 * be selected, and PostgREST's plain `count` reads every column.
 */
export async function listPracticeSubjects(supabase: Supabase): Promise<PracticeGrade[]> {
	const { data, error } = await supabase
		.from('grade_levels')
		.select(
			`id, name,
			subjects (id, name, cover_image_path,
				topics (stages (id)),
				questions (id.count()))`
		)
		.order('display_order')
		.order('created_at')
		.order('display_order', { referencedTable: 'subjects' })
		.order('created_at', { referencedTable: 'subjects' });
	if (error) throw error;

	const covers = supabase.storage.from(CURRICULUM_IMAGES);
	return data.map((grade) => ({
		id: grade.id,
		name: grade.name,
		subjects: grade.subjects.map((subject) => ({
			id: subject.id,
			name: subject.name,
			coverUrl: subject.cover_image_path
				? covers.getPublicUrl(subject.cover_image_path).data.publicUrl
				: null,
			topicCount: subject.topics.length,
			stageCount: subject.topics.reduce((sum, topic) => sum + topic.stages.length, 0),
			questionCount: subject.questions[0]?.count ?? 0
		}))
	}));
}

// ---- One subject: its topics and their stages -----------------------------

export interface Stage {
	id: string;
	name: string;
	questionCount: number;
}

export interface TopicStages {
	id: string;
	name: string;
	/** In path order: the order pupils meet them in. */
	stages: Stage[];
}

export interface SubjectStages {
	id: string;
	name: string;
	grade: { id: string; name: string };
	topics: TopicStages[];
}

/** A subject's topics, each with its stages; null when there is no such subject. */
export async function getSubjectStages(
	supabase: Supabase,
	subjectId: string
): Promise<SubjectStages | null> {
	const { data, error } = await supabase
		.from('subjects')
		.select(
			`id, name,
			grade_levels!inner (id, name),
			topics (id, name,
				stages (id, name, questions (id.count())))`
		)
		.eq('id', subjectId)
		.order('display_order', { referencedTable: 'topics' })
		.order('created_at', { referencedTable: 'topics' })
		.order('display_order', { referencedTable: 'topics.stages' })
		.order('created_at', { referencedTable: 'topics.stages' })
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;

	return {
		id: data.id,
		name: data.name,
		grade: data.grade_levels,
		topics: data.topics.map((topic) => ({
			id: topic.id,
			name: topic.name,
			stages: topic.stages.map((stage) => ({
				id: stage.id,
				name: stage.name,
				questionCount: stage.questions[0]?.count ?? 0
			}))
		}))
	};
}

/** Adds a stage at the end of its topic's path. */
export async function addStage(supabase: Supabase, topicId: string, name: string): Promise<void> {
	const siblings = await supabase.from('stages').select('display_order').eq('topic_id', topicId);
	if (siblings.error) throw siblings.error;
	const display_order = Math.max(0, ...siblings.data.map((row) => row.display_order)) + 1;

	const { error } = await supabase
		.from('stages')
		.insert({ name, display_order, topic_id: topicId });
	if (error) throw error;
}

export async function renameStage(supabase: Supabase, id: string, name: string): Promise<void> {
	// Row level security hides a row it will not let you change rather than raising, so an
	// update that touched nothing is a failure, not a success.
	const { data, error } = await supabase.from('stages').update({ name }).eq('id', id).select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`stages ${id} was not renamed`);
}

/**
 * Deletes a stage and, through the database's cascades, its questions,
 * passages and practice records. The pictures of what was in it go last, so a
 * refused delete leaves them where they are.
 */
export async function deleteStage(supabase: Supabase, id: string): Promise<void> {
	const { data, error } = await supabase.from('stages').delete().eq('id', id).select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`stages ${id} was not deleted`);

	await removeStagePictures(supabase, [id]);
}

/** Saves a topic's path; `ids` must name each of its stages exactly once. */
export async function reorderStages(
	supabase: Supabase,
	topicId: string,
	ids: string[]
): Promise<void> {
	const { error } = await supabase.rpc('reorder_stages', { p_topic_id: topicId, p_ids: ids });
	if (error) throw error;
}

// ---- One stage: its questions ---------------------------------------------

/**
 * What a question teaches: a tag. A topic has a list of them, and each of its
 * questions is filed under any number of that list.
 */
export interface LearningPoint {
	id: string;
	name: string;
}

export interface StageQuestion {
	id: string;
	difficulty: Difficulty;
	payload: ItemPayload;
	/** In the order of their names. */
	learningPoints: LearningPoint[];
}

export interface StagePassage {
	id: string;
	title: string;
	body: string;
	/** Object path of the passage's picture in the question images bucket. */
	imagePath: string | null;
	/** The passage's own questions, in their own order. */
	questions: StageQuestion[];
}

/** One place in a stage's order: a question that stands alone, or a passage with its questions. */
export type StageEntry =
	({ kind: 'question' } & StageQuestion) | ({ kind: 'passage' } & StagePassage);

export interface StageDetail {
	id: string;
	name: string;
	questionOrder: QuestionOrder;
	topic: { id: string; name: string };
	subject: { id: string; name: string };
	grade: { id: string; name: string };
	/** The stage's one sequence, shared by its passages and the questions on no passage. */
	entries: StageEntry[];
	/** The learning points of the stage's topic: the ones a question of it can be given. */
	learningPoints: LearningPoint[];
	/** What a picture's object path is appended to, to get its public URL. */
	imageBase: string;
}

/**
 * A stage with everything the builder shows; null when the subject has no such
 * stage. The questions come through `get_bank_questions`, because the column
 * that holds their answers cannot be selected from the table.
 */
export async function getStage(
	supabase: Supabase,
	subjectId: string,
	stageId: string
): Promise<StageDetail | null> {
	const [stage, questions, passages, tagged] = await Promise.all([
		supabase
			.from('stages')
			.select(
				`id, name, question_order,
				topics!inner (id, name,
					tags (id, name),
					subjects!inner (id, name,
						grade_levels!inner (id, name)))`
			)
			.eq('id', stageId)
			.maybeSingle(),
		supabase.rpc('get_bank_questions', { p_stage_id: stageId }),
		supabase
			.from('passages')
			.select('id, title, body, image_path, display_order')
			.eq('stage_id', stageId)
			.order('display_order')
			.order('created_at'),
		supabase
			.from('question_tags')
			.select('question_id, tags!inner (id, name), questions!inner (stage_id)')
			.eq('questions.stage_id', stageId)
	]);
	if (stage.error) throw stage.error;
	const topic = stage.data?.topics;
	if (!stage.data || !topic || topic.subjects.id !== subjectId) return null;
	if (questions.error) throw questions.error;
	if (passages.error) throw passages.error;
	if (tagged.error) throw tagged.error;

	// The function returns them in order, so each sequence below keeps its own.
	const question = (row: (typeof questions.data)[number]): StageQuestion => ({
		id: row.id,
		difficulty: row.difficulty,
		// The table's CHECK lets nothing in that is not an item payload.
		payload: row.payload as unknown as ItemPayload,
		learningPoints: byName(
			tagged.data.filter((each) => each.question_id === row.id).map((each) => each.tags)
		)
	});

	const entries: { order: number; entry: StageEntry }[] = [
		...questions.data
			.filter((row) => row.passage_id === null)
			.map((row) => ({
				order: row.display_order,
				entry: { kind: 'question' as const, ...question(row) }
			})),
		...passages.data.map((passage) => ({
			order: passage.display_order,
			entry: {
				kind: 'passage' as const,
				id: passage.id,
				title: passage.title,
				body: passage.body,
				imagePath: passage.image_path,
				questions: questions.data.filter((row) => row.passage_id === passage.id).map(question)
			}
		}))
	];

	return {
		id: stage.data.id,
		name: stage.data.name,
		questionOrder: stage.data.question_order === 'random' ? 'random' : 'fixed',
		topic: { id: topic.id, name: topic.name },
		subject: { id: topic.subjects.id, name: topic.subjects.name },
		grade: topic.subjects.grade_levels,
		entries: entries.sort((a, b) => a.order - b.order).map(({ entry }) => entry),
		learningPoints: byName(topic.tags),
		imageBase: supabase.storage.from(QUESTION_IMAGES).getPublicUrl('').data.publicUrl
	};
}

/** Learning points in the order they are listed in: by name. */
function byName(points: LearningPoint[]): LearningPoint[] {
	return points.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function setQuestionOrder(
	supabase: Supabase,
	stageId: string,
	order: QuestionOrder
): Promise<void> {
	const { data, error } = await supabase
		.from('stages')
		.update({ question_order: order })
		.eq('id', stageId)
		.select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`stages ${stageId} was not updated`);
}

/**
 * Saves the stage's one sequence; `ids` must name each of its passages and
 * each of its questions on no passage exactly once.
 */
export async function reorderStageEntries(
	supabase: Supabase,
	stageId: string,
	ids: string[]
): Promise<void> {
	const { error } = await supabase.rpc('reorder_stage_entries', {
		p_stage_id: stageId,
		p_ids: ids
	});
	if (error) throw error;
}

/**
 * Saves the own sequence of one of the stage's passages; `ids` must name each
 * of the passage's questions exactly once.
 */
export async function reorderPassageQuestions(
	supabase: Supabase,
	stageId: string,
	passageId: string,
	ids: string[]
): Promise<void> {
	// The function below asks only that the ids are the passage's own, so that the passage
	// is this stage's is asked here.
	const passage = await supabase
		.from('passages')
		.select('id')
		.eq('id', passageId)
		.eq('stage_id', stageId)
		.maybeSingle();
	if (passage.error) throw passage.error;
	if (!passage.data) throw new Error(`passages ${passageId} is not in stage ${stageId}`);

	const { error } = await supabase.rpc('reorder_passage_questions', {
		p_passage_id: passageId,
		p_ids: ids
	});
	if (error) throw error;
}

/** A question as stored, with where it stands; undefined when the stage has no such question. */
async function readQuestion(supabase: Supabase, stageId: string, id: string) {
	const { data, error } = await supabase
		.rpc('get_bank_questions', { p_stage_id: stageId })
		.eq('id', id)
		.maybeSingle();
	if (error) throw error;
	return data ?? undefined;
}

/** The stage's own pictures among `paths`: only these may be removed with a row of it. */
function ownPictures(stageId: string, paths: string[]): string[] {
	return paths.filter((path) => path.startsWith(`${stageFolder(stageId)}/`));
}

async function removePictures(supabase: Supabase, paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	const { error } = await supabase.storage.from(QUESTION_IMAGES).remove(paths);
	if (error) console.error(error);
}

/**
 * Gives `value` pictures of its own. `place` is asked about each picture
 * `value` names: it stores one and answers with where, or answers with
 * nothing for a picture that stays as it is named. What comes back is `value`
 * naming where they are stored now, and a way to take them out again if the
 * row is then refused. If one cannot be stored, the ones before it are taken
 * out again.
 */
async function placePictures<T>(
	supabase: Supabase,
	value: T,
	place: (path: string) => Promise<string | undefined>
): Promise<{ value: T; undo: () => Promise<void> }> {
	const placed = new Map<string, string>();
	const undo = () => removePictures(supabase, [...placed.values()]);
	try {
		for (const path of imagePaths(value)) {
			const stored = await place(path);
			if (stored) placed.set(path, stored);
		}
	} catch (cause) {
		await undo();
		throw cause;
	}
	return { value: mapImagePaths(value, (path) => placed.get(path) ?? path), undo };
}

/**
 * Writes a row of the stage that names pictures, a question or a passage, and
 * returns its id. `value` names each picture picked for it as `upload:<key>`
 * and `pictures` holds the file behind each key; `write` stores the row, given
 * `value` naming where they are stored now.
 *
 * A stored picture belongs to one row, so `value` may keep the ones the row
 * named `before` and name no other's. The new pictures are uploaded before the
 * row names them, and the ones the row no longer names are removed only after
 * it has stopped naming them, so a row never names a picture that is not there.
 */
async function saveWithPictures<T>(
	supabase: Supabase,
	stageId: string,
	value: T,
	before: string[],
	pictures: Map<string, Picture>,
	write: (value: T) => Promise<string>
): Promise<string> {
	const stray = strayPicture(value, before);
	if (stray) throw new Error(`A row of stage ${stageId} may not name ${stray}`);

	const { value: stored, undo } = await placePictures(supabase, value, async (path) => {
		const key = uploadKey(path);
		if (key === null) return undefined;
		const picture = pictures.get(key);
		if (!picture) throw new Error(`No picture was posted for ${path}`);
		return uploadPicture(supabase, QUESTION_IMAGES, stageFolder(stageId), picture);
	});

	let id: string;
	try {
		id = await write(stored);
	} catch (cause) {
		await undo();
		throw cause;
	}

	const after = imagePaths(stored);
	await removePictures(
		supabase,
		ownPictures(stageId, before).filter((path) => !after.includes(path))
	);
	return id;
}

export interface QuestionInput {
	/** Null for a question not stored yet. */
	id: string | null;
	/** The passage a new question joins; null for one that stands alone. */
	passageId: string | null;
	difficulty: Difficulty;
	/** Complete and tidied. A picture not uploaded yet is `upload:<key>`. */
	payload: ItemPayload;
}

/**
 * Writes a question and returns its id: a new one goes to the end of its
 * sequence, an existing one is replaced where it stands, on the passage it is
 * on. Its learning points are written apart, by `setLearningPoints`, and its
 * pictures follow the Save as `saveWithPictures` says.
 */
export async function saveQuestion(
	supabase: Supabase,
	stageId: string,
	input: QuestionInput,
	pictures: Map<string, Picture>
): Promise<string> {
	const stored = input.id ? await readQuestion(supabase, stageId, input.id) : undefined;
	if (input.id && !stored) throw new Error(`questions ${input.id} is not in stage ${stageId}`);

	return saveWithPictures(
		supabase,
		stageId,
		input.payload,
		imagePaths(stored?.payload),
		pictures,
		async (payload) => {
			// The generated type of a jsonb column is looser than the payload's own.
			const row = { payload: payload as never, difficulty: input.difficulty };
			if (stored) {
				const { data, error } = await supabase
					.from('questions')
					.update(row)
					.eq('id', stored.id)
					.select('id');
				if (error) throw error;
				if (data.length === 0) throw new Error(`questions ${stored.id} was not updated`);
				return stored.id;
			}
			// It names no place: the database puts a new row at the end of its sequence.
			const { data, error } = await supabase
				.from('questions')
				.insert({ ...row, stage_id: stageId, passage_id: input.passageId })
				.select('id')
				.single();
			if (error) throw error;
			return data.id;
		}
	);
}

/** Deletes a question, and then its pictures. */
export async function deleteQuestion(
	supabase: Supabase,
	stageId: string,
	id: string
): Promise<void> {
	const stored = await readQuestion(supabase, stageId, id);

	const { data, error } = await supabase
		.from('questions')
		.delete()
		.eq('id', id)
		.eq('stage_id', stageId)
		.select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`questions ${id} was not deleted`);

	await removePictures(supabase, ownPictures(stageId, imagePaths(stored?.payload)));
}

/**
 * Makes a question's learning points exactly the tags `tagIds` names. One it
 * is given must be one its stage's topic has; one it already has may stay
 * whatever the topic's list has become.
 */
export async function setLearningPoints(
	supabase: Supabase,
	stageId: string,
	questionId: string,
	tagIds: string[]
): Promise<void> {
	const [current, offered] = await Promise.all([
		supabase.from('question_tags').select('tag_id').eq('question_id', questionId),
		supabase.from('stages').select('topics!inner (tag_topics (tag_id))').eq('id', stageId).single()
	]);
	if (current.error) throw current.error;
	if (offered.error) throw offered.error;

	const had = current.data.map((row) => row.tag_id);
	const added = [...new Set(tagIds)].filter((id) => !had.includes(id));
	const removed = had.filter((id) => !tagIds.includes(id));

	const ofTopic = offered.data.topics.tag_topics.map((row) => row.tag_id);
	const stray = added.find((id) => !ofTopic.includes(id));
	if (stray) throw new Error(`tags ${stray} is not a learning point of stage ${stageId}'s topic`);

	if (removed.length > 0) {
		const { error } = await supabase
			.from('question_tags')
			.delete()
			.eq('question_id', questionId)
			.in('tag_id', removed);
		if (error) throw error;
	}
	if (added.length > 0) {
		const { error } = await supabase
			.from('question_tags')
			.insert(added.map((tag_id) => ({ question_id: questionId, tag_id })));
		if (error) throw error;
	}
}

/**
 * Copies a question to the end of its sequence, on the passage it is on if it
 * is on one, and returns the copy's id. The copy has the same learning points
 * and gets pictures of its own, so deleting either question leaves the
 * other's in place.
 */
export async function duplicateQuestion(
	supabase: Supabase,
	stageId: string,
	id: string
): Promise<string> {
	const stored = await readQuestion(supabase, stageId, id);
	if (!stored) throw new Error(`questions ${id} is not in stage ${stageId}`);

	const pictures = supabase.storage.from(QUESTION_IMAGES);
	const { value: payload, undo } = await placePictures(supabase, stored.payload, async (path) => {
		// A stored picture's name ends in the extension of what it is, which the copy keeps.
		const extension = /\.[a-z0-9]+$/.exec(path)?.[0] ?? '';
		const copy = `${stageFolder(stageId)}/${crypto.randomUUID()}${extension}`;
		const { error } = await pictures.copy(path, copy);
		if (error) throw error;
		return copy;
	});

	try {
		const { data, error } = await supabase
			.from('questions')
			.insert({
				stage_id: stageId,
				passage_id: stored.passage_id,
				difficulty: stored.difficulty,
				payload
			})
			.select('id')
			.single();
		if (error) throw error;

		try {
			// Whatever the question has, the copy has: nothing here is newly given.
			const tags = await supabase.from('question_tags').select('tag_id').eq('question_id', id);
			if (tags.error) throw tags.error;
			if (tags.data.length > 0) {
				const copied = await supabase
					.from('question_tags')
					.insert(tags.data.map(({ tag_id }) => ({ question_id: data.id, tag_id })));
				if (copied.error) throw copied.error;
			}
		} catch (cause) {
			// Half a copy is taken back, so a copy is always the whole question.
			await supabase.from('questions').delete().eq('id', data.id);
			throw cause;
		}
		return data.id;
	} catch (cause) {
		await undo();
		throw cause;
	}
}

// ---- One stage: its passages ----------------------------------------------

export interface PassageInput {
	/** Null for a passage not stored yet. */
	id: string | null;
	/** Complete and tidied. A picture not uploaded yet is `upload:<key>`. */
	content: PassageContent;
}

/**
 * Writes a passage and returns its id: a new one goes to the end of the
 * stage's sequence, with no questions yet; an existing one is replaced where
 * it stands. Its picture follows the Save as `saveWithPictures` says.
 */
export async function savePassage(
	supabase: Supabase,
	stageId: string,
	input: PassageInput,
	pictures: Map<string, Picture>
): Promise<string> {
	const { id } = input;
	let before: string[] = [];
	if (id) {
		const stored = await supabase
			.from('passages')
			.select('image_path')
			.eq('id', id)
			.eq('stage_id', stageId)
			.maybeSingle();
		if (stored.error) throw stored.error;
		if (!stored.data) throw new Error(`passages ${id} is not in stage ${stageId}`);
		before = imagePaths(stored.data);
	}

	return saveWithPictures(supabase, stageId, input.content, before, pictures, async (content) => {
		if (id) {
			const { data, error } = await supabase
				.from('passages')
				.update(content)
				.eq('id', id)
				.select('id');
			if (error) throw error;
			if (data.length === 0) throw new Error(`passages ${id} was not updated`);
			return id;
		}
		const { data, error } = await supabase
			.from('passages')
			.insert({ ...content, stage_id: stageId })
			.select('id')
			.single();
		if (error) throw error;
		return data.id;
	});
}

/**
 * Deletes a passage and, through the database's cascade, its questions. Its
 * picture and theirs go last, so a refused delete leaves them where they are.
 */
export async function deletePassage(
	supabase: Supabase,
	stageId: string,
	id: string
): Promise<void> {
	const [passage, questions] = await Promise.all([
		supabase
			.from('passages')
			.select('image_path')
			.eq('id', id)
			.eq('stage_id', stageId)
			.maybeSingle(),
		supabase.rpc('get_bank_questions', { p_stage_id: stageId }).eq('passage_id', id)
	]);
	if (passage.error) throw passage.error;
	if (questions.error) throw questions.error;

	const { data, error } = await supabase
		.from('passages')
		.delete()
		.eq('id', id)
		.eq('stage_id', stageId)
		.select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`passages ${id} was not deleted`);

	const pictures = imagePaths([passage.data, questions.data.map((question) => question.payload)]);
	await removePictures(supabase, ownPictures(stageId, pictures));
}

// ---- One stage: an import -------------------------------------------------

/**
 * Adds what an import plans to the end of a stage and returns how many
 * questions that was: first its passages, in their order, then its questions
 * in theirs. A question on a passage goes to the end of that passage instead.
 * The database does it as one piece: an import leaves everything behind or
 * nothing.
 */
export async function importRows(
	supabase: Supabase,
	stageId: string,
	plan: Pick<ImportPlan, 'passages' | 'questions'>
): Promise<number> {
	const { data, error } = await supabase.rpc('import_stage_rows', {
		p_stage_id: stageId,
		p_passages: plan.passages,
		// The generated type of a jsonb argument is looser than the plan's own.
		p_questions: plan.questions as never
	});
	if (error) throw error;
	return data;
}
