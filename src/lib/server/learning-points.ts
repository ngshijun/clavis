import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod';
import type { Database } from '#lib/database.types.js';
import type { LearningPointSummary } from '#lib/learning-points.js';
import { m } from '#lib/paraglide/messages.js';
import { unexpected } from '#lib/server/forms.js';

type Supabase = SupabaseClient<Database>;

/**
 * Every learning point, by name, each with the topics that offer it and how
 * many questions are filed under it. The questions are counted by the
 * database, so none is read to be counted.
 */
export async function listLearningPoints(supabase: Supabase): Promise<LearningPointSummary[]> {
	const { data, error } = await supabase
		.from('tags')
		.select('id, name, tag_topics (topic_id), question_tags (count)')
		.order('name');
	if (error) throw error;

	return data.map((tag) => ({
		id: tag.id,
		name: tag.name,
		topicIds: tag.tag_topics.map((row) => row.topic_id),
		questionCount: tag.question_tags[0]?.count ?? 0
	}));
}

const savedSchema = z.object({
	name: z
		.string({ error: () => m.learning_point_name_required() })
		.trim()
		.min(1, { error: () => m.learning_point_name_required() })
		.max(120, { error: () => m.row_name_invalid() }),
	topics: z
		.array(z.guid())
		.min(1, { error: () => m.learning_point_topics_required() })
		.max(500)
});

/**
 * Makes a learning point from a posted form, or changes the one given, as an
 * admin: the database lets nobody else. Its name and its topics are saved
 * together or not at all, and a topic it is taken away from loses it on its
 * questions too. It answers as a form action does: nothing when it was
 * saved, and otherwise a failure carrying the field to put right.
 */
export async function saveLearningPoint(supabase: Supabase, form: FormData, id?: string) {
	const parsed = savedSchema.safeParse({ name: form.get('name'), topics: form.getAll('topics') });
	if (!parsed.success) {
		return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
	}

	const { error } = await supabase.rpc('save_learning_point', {
		// The generated type has no null for an argument, and null is how a new one is asked for.
		p_id: (id ?? null) as string,
		p_name: parsed.data.name,
		p_topic_ids: parsed.data.topics
	});
	// A name is one learning point's, whatever its capitals.
	if (error?.code === '23505') {
		return fail(409, { errors: { name: [m.learning_point_name_taken()] } });
	}
	if (error) return unexpected(error);
}

/**
 * Deletes a learning point, as an admin. It goes from the topics that offer
 * it and from every question filed under it; the questions themselves stay.
 */
export async function deleteLearningPoint(supabase: Supabase, id: string): Promise<void> {
	const { data, error } = await supabase.from('tags').delete().eq('id', id).select('id');
	if (error) throw error;
	// Row level security hides a row it will not let the caller delete rather than raising.
	if (data.length === 0) throw new Error(`tags ${id} was not deleted`);
}
