import { error } from '@sveltejs/kit';
import { getSubjectStages } from '#lib/server/practice.js';
import { lastScores } from '#lib/server/run.js';
import type { PageServerLoad } from './$types';

/**
 * A classroom's practice: the stages of its subject, topic by topic, with
 * what the student scored on each the last time they practised it here. The
 * scores are this classroom's own: the same stage practised in another
 * classroom does not show.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classroom } = await parent();
	const [subject, scores] = await Promise.all([
		getSubjectStages(locals.supabase, classroom.subjectId),
		lastScores(locals.supabase, classroom.id)
	]);
	if (!subject) error(404, 'Subject not found');

	return {
		// A stage with no question cannot be practised, and a topic left with no stage is not shown.
		topics: subject.topics
			.map((topic) => ({
				...topic,
				stages: topic.stages.filter((stage) => stage.questionCount > 0)
			}))
			.filter((topic) => topic.stages.length > 0),
		scores
	};
};
