import { describe, expect, it } from 'vitest';
import { listSections, type LearningPointSummary, type TopicTree } from './learning-points.js';

const tree: TopicTree = [
	{
		id: 'g1',
		name: 'Year 1',
		subjects: [
			{
				id: 'maths',
				name: 'Mathematics',
				topics: [
					{ id: 'numbers', name: 'Whole Numbers' },
					{ id: 'operations', name: 'Basic Operations' }
				]
			},
			{ id: 'science', name: 'Science', topics: [{ id: 'plants', name: 'Plants' }] },
			{ id: 'english', name: 'English', topics: [{ id: 'grammar', name: 'Grammar' }] }
		]
	}
];

const point = (name: string, ...topicIds: string[]): LearningPointSummary => ({
	id: name,
	name,
	topicIds,
	questionCount: 0
});

const names = (rows: { point: LearningPointSummary }[]) => rows.map((row) => row.point.name);

describe('listSections', () => {
	it('lists a subject’s learning points topic by topic, and by name within a topic', () => {
		const { sections } = listSections(tree, [
			point('subtraction', 'operations'),
			point('place value', 'numbers'),
			point('addition', 'operations'),
			point('counting', 'numbers')
		]);

		expect(sections).toHaveLength(1);
		expect(sections[0]).toMatchObject({ id: 'maths', subject: 'Mathematics', grade: 'Year 1' });
		expect(names(sections[0].rows)).toEqual(['counting', 'place value', 'addition', 'subtraction']);
	});

	it('leaves out a subject that has none', () => {
		const { sections } = listSections(tree, [point('parts of a plant', 'plants')]);

		expect(sections.map((section) => section.id)).toEqual(['science']);
	});

	it('puts one that two subjects offer under both, and says how many topics are elsewhere', () => {
		const { sections } = listSections(tree, [
			point('measuring', 'operations', 'plants', 'numbers')
		]);

		expect(sections.map((section) => section.id)).toEqual(['maths', 'science']);
		expect(sections[0].rows[0]).toMatchObject({
			topics: ['Whole Numbers', 'Basic Operations'],
			elsewhere: 1
		});
		expect(sections[1].rows[0]).toMatchObject({ topics: ['Plants'], elsewhere: 2 });
	});

	it('sets apart the ones no topic offers', () => {
		const { sections, unplaced } = listSections(tree, [point('lost'), point('verbs', 'grammar')]);

		expect(unplaced.map((each) => each.name)).toEqual(['lost']);
		expect(sections.map((section) => section.id)).toEqual(['english']);
	});

	it('searches the names and the topics, whatever the capitals', () => {
		const points = [
			point('place value', 'numbers'),
			point('addition', 'operations'),
			point('verbs', 'grammar'),
			point('lost value')
		];

		const byName = listSections(tree, points, ' VALUE ');
		expect(byName.sections.map((section) => names(section.rows))).toEqual([['place value']]);
		expect(byName.unplaced.map((each) => each.name)).toEqual(['lost value']);

		const byTopic = listSections(tree, points, 'basic');
		expect(byTopic.sections.map((section) => names(section.rows))).toEqual([['addition']]);
		expect(byTopic.unplaced).toEqual([]);
	});
});
