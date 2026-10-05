import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import { imagePath } from '#lib/server/images.js';

type Supabase = SupabaseClient<Database>;

export const CURRICULUM_IMAGES = 'curriculum-images';

/** The three levels of the curriculum's trunk, outermost first. */
export type Kind = 'grade' | 'subject' | 'topic';
/** The levels that carry a cover image. */
export type CoveredKind = Exclude<Kind, 'grade'>;
/** A level, and for the two that have one, the row its rows sit under. */
export type Placement = { kind: 'grade' } | { kind: CoveredKind; parentId: string };

export interface Topic {
	id: string;
	name: string;
	/** Public URL of the cover image; null when there is none. */
	coverUrl: string | null;
}

export interface Subject extends Topic {
	topics: Topic[];
}

export interface GradeLevel {
	id: string;
	name: string;
	subjects: Subject[];
}

const TABLE = { grade: 'grade_levels', subject: 'subjects', topic: 'topics' } as const;

/** The whole trunk, every level in the order the admin has arranged it. */
export async function listCurriculum(supabase: Supabase): Promise<GradeLevel[]> {
	const { data, error } = await supabase
		.from('grade_levels')
		.select(
			`id, name,
			subjects (id, name, cover_image_path,
				topics (id, name, cover_image_path))`
		)
		.order('display_order')
		.order('created_at')
		.order('display_order', { referencedTable: 'subjects' })
		.order('created_at', { referencedTable: 'subjects' })
		.order('display_order', { referencedTable: 'subjects.topics' })
		.order('created_at', { referencedTable: 'subjects.topics' });
	if (error) throw error;

	const coverUrl = (path: string | null) =>
		path ? supabase.storage.from(CURRICULUM_IMAGES).getPublicUrl(path).data.publicUrl : null;

	return data.map((grade) => ({
		id: grade.id,
		name: grade.name,
		subjects: grade.subjects.map((subject) => ({
			id: subject.id,
			name: subject.name,
			coverUrl: coverUrl(subject.cover_image_path),
			topics: subject.topics.map((topic) => ({
				id: topic.id,
				name: topic.name,
				coverUrl: coverUrl(topic.cover_image_path)
			}))
		}))
	}));
}

/** Adds a row after the rows it joins. */
export async function addNode(supabase: Supabase, place: Placement, name: string): Promise<void> {
	const siblings =
		place.kind === 'grade'
			? await supabase.from('grade_levels').select('display_order')
			: place.kind === 'subject'
				? await supabase
						.from('subjects')
						.select('display_order')
						.eq('grade_level_id', place.parentId)
				: await supabase.from('topics').select('display_order').eq('subject_id', place.parentId);
	if (siblings.error) throw siblings.error;
	const display_order = Math.max(0, ...siblings.data.map((row) => row.display_order ?? 0)) + 1;

	const { error } =
		place.kind === 'grade'
			? await supabase.from('grade_levels').insert({ name, display_order })
			: place.kind === 'subject'
				? await supabase
						.from('subjects')
						.insert({ name, display_order, grade_level_id: place.parentId })
				: await supabase.from('topics').insert({ name, display_order, subject_id: place.parentId });
	if (error) throw error;
}

export async function renameNode(
	supabase: Supabase,
	kind: Kind,
	id: string,
	name: string
): Promise<void> {
	// Row level security hides a row it will not let you change rather than raising, so an
	// update that touched nothing is a failure, not a success.
	const { data, error } = await supabase
		.from(TABLE[kind])
		.update({ name })
		.eq('id', id)
		.select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`${TABLE[kind]} ${id} was not renamed`);
}

/**
 * Deletes a row and, through the database's cascades, everything beneath it.
 * The cover images of what was deleted go last: the delete is refused while a
 * classroom or an assessment item still uses the row, and a refused delete
 * must leave the images where they are.
 */
export async function deleteNode(supabase: Supabase, kind: Kind, id: string): Promise<void> {
	const covers = await coverPaths(supabase, kind, id);

	const { data, error } = await supabase.from(TABLE[kind]).delete().eq('id', id).select('id');
	if (error) throw error;
	if (data.length === 0) throw new Error(`${TABLE[kind]} ${id} was not deleted`);

	if (covers.length > 0) {
		const { error: removeError } = await supabase.storage.from(CURRICULUM_IMAGES).remove(covers);
		if (removeError) console.error(removeError);
	}
}

/** The cover images of a row and of everything beneath it. */
async function coverPaths(supabase: Supabase, kind: Kind, id: string): Promise<string[]> {
	const present = (rows: { cover_image_path: string | null }[]) =>
		rows.map((row) => row.cover_image_path).filter((path) => path !== null);

	if (kind === 'topic') {
		const { data, error } = await supabase.from('topics').select('cover_image_path').eq('id', id);
		if (error) throw error;
		return present(data);
	}

	const { data, error } = await supabase
		.from('subjects')
		.select('cover_image_path, topics (cover_image_path)')
		.eq(kind === 'grade' ? 'grade_level_id' : 'id', id);
	if (error) throw error;
	return present([...data, ...data.flatMap((subject) => subject.topics)]);
}

/** Saves the order of every row at one place; `ids` must name each of them exactly once. */
export async function reorderNodes(
	supabase: Supabase,
	place: Placement,
	ids: string[]
): Promise<void> {
	const { error } =
		place.kind === 'grade'
			? await supabase.rpc('reorder_grade_levels', { p_ids: ids })
			: place.kind === 'subject'
				? await supabase.rpc('reorder_subjects', { p_grade_level_id: place.parentId, p_ids: ids })
				: await supabase.rpc('reorder_topics', { p_subject_id: place.parentId, p_ids: ids });
	if (error) throw error;
}

/**
 * Replaces a subject's or a topic's cover image, or removes it when `file` is
 * null. The new image is uploaded before the row points at it and the old one
 * is deleted only after the row has stopped pointing at it, so the row never
 * names an image that is not there.
 */
export async function setCover(
	supabase: Supabase,
	kind: CoveredKind,
	id: string,
	file: File | null
): Promise<void> {
	const table = TABLE[kind];
	const images = supabase.storage.from(CURRICULUM_IMAGES);

	const { data: row, error: readError } = await supabase
		.from(table)
		.select('cover_image_path')
		.eq('id', id)
		.single();
	if (readError) throw readError;

	let next: string | null = null;
	if (file) {
		next = imagePath(`${table}/${id}`, file);
		const { error: uploadError } = await images.upload(next, file, {
			cacheControl: '31536000',
			contentType: file.type
		});
		if (uploadError) throw uploadError;
	}

	const { data: updated, error: updateError } = await supabase
		.from(table)
		.update({ cover_image_path: next })
		.eq('id', id)
		.select('id');
	if (updateError || updated.length === 0) {
		if (next) await images.remove([next]);
		throw updateError ?? new Error(`${table} ${id} was not updated`);
	}

	if (row.cover_image_path) {
		const { error: removeError } = await images.remove([row.cover_image_path]);
		if (removeError) console.error(removeError);
	}
}
