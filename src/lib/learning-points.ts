/**
 * The learning points as their page lists them. A learning point is one
 * name, offered by the topics it is of; the page shows the names subject by
 * subject, in the curriculum's order, so one that two subjects offer stands
 * under both.
 */

/** A learning point with what the page says of it. */
export interface LearningPointSummary {
	id: string;
	/** In small letters, as it is stored. */
	name: string;
	/** The topics that offer it. */
	topicIds: string[];
	/** How many questions are filed under it. */
	questionCount: number;
}

/** The curriculum as far as learning points look at it: every topic, under its subject and grade level. */
export type TopicTree = {
	id: string;
	name: string;
	subjects: { id: string; name: string; topics: { id: string; name: string }[] }[];
}[];

/** A learning point as it stands under one subject. */
export interface LearningPointRow {
	point: LearningPointSummary;
	/** The subject's topics that offer it, in the curriculum's order. */
	topics: string[];
	/** How many topics of other subjects offer it too. */
	elsewhere: number;
}

export interface LearningPointSection {
	/** The subject's id. */
	id: string;
	subject: string;
	grade: string;
	/** By the first topic that offers each, then by name: a topic's learning points stand together. */
	rows: LearningPointRow[];
}

/**
 * The page's lists: a section for each subject that has a learning point,
 * and the learning points no topic offers, which belong under no subject.
 * With something `search`ed for, only the learning points whose name has it,
 * or one of whose topics in the section has it, are left.
 */
export function listSections(
	tree: TopicTree,
	points: LearningPointSummary[],
	search = ''
): { sections: LearningPointSection[]; unplaced: LearningPointSummary[] } {
	const query = search.trim().toLowerCase();
	const has = (text: string) => text.toLowerCase().includes(query);

	const sections = tree.flatMap((grade) =>
		grade.subjects.map((subject): LearningPointSection => {
			const place = new Map(subject.topics.map((topic, index) => [topic.id, index]));
			const rows = points.flatMap((point) => {
				const at = point.topicIds
					.map((id) => place.get(id))
					.filter((index) => index !== undefined)
					.sort((a, b) => a - b);
				if (at.length === 0) return [];
				const topics = at.map((index) => subject.topics[index].name);
				if (!has(point.name) && !topics.some(has)) return [];
				return [
					{ first: at[0], row: { point, topics, elsewhere: point.topicIds.length - at.length } }
				];
			});
			rows.sort((a, b) => a.first - b.first || a.row.point.name.localeCompare(b.row.point.name));
			return {
				id: subject.id,
				subject: subject.name,
				grade: grade.name,
				rows: rows.map(({ row }) => row)
			};
		})
	);

	return {
		sections: sections.filter((section) => section.rows.length > 0),
		unplaced: points.filter((point) => point.topicIds.length === 0 && has(point.name))
	};
}
