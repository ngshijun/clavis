import { describe, expect, it } from 'vitest';
import {
	blankNumeric,
	blankOf,
	CLOZE_MODE_LABELS,
	DIFFICULTY_LABELS,
	hasTip,
	ITEM_KINDS,
	KIND_GROUP_LABELS,
	KIND_GROUPS,
	newId,
	NUMERIC_FORM_LABELS
} from './kinds.js';
import {
	CLOZE_MODES,
	DIFFICULTIES,
	ITEM_TYPES,
	NUMERIC_FORMS,
	type ClozePayload
} from './payload.js';
import { validateItem } from './schema.js';

describe('newId', () => {
	it('makes short ids that do not repeat', () => {
		const ids = Array.from({ length: 200 }, newId);
		expect(new Set(ids).size).toBe(200);
		expect(ids.every((id) => /^[0-9a-f]{8}$/.test(id))).toBe(true);
	});
});

describe('ITEM_KINDS', () => {
	it('lists the fourteen types under their headings, in the order of the board', () => {
		expect(ITEM_TYPES).toHaveLength(14);
		expect(Object.keys(ITEM_KINDS)).toEqual([...ITEM_TYPES]);
		expect(ITEM_TYPES.map((type) => ITEM_KINDS[type].group)).toEqual([
			...Array(5).fill('choose'),
			...Array(4).fill('fill_in'),
			...Array(4).fill('arrange'),
			'picture'
		]);
		// Grouping the types by heading must not reorder them.
		expect(
			KIND_GROUPS.flatMap((group) => ITEM_TYPES.filter((type) => ITEM_KINDS[type].group === group))
		).toEqual([...ITEM_TYPES]);
	});

	it.each(ITEM_TYPES)('names and describes %s', (type) => {
		const { label, blurb, marking } = ITEM_KINDS[type];
		for (const words of [label(), blurb(), marking()]) expect(words).not.toBe('');
		expect(new Set([label(), blurb(), marking()]).size).toBe(3);
	});

	it('gives every type its own name', () => {
		expect(new Set(ITEM_TYPES.map((type) => ITEM_KINDS[type].label())).size).toBe(14);
	});

	it.each(ITEM_TYPES)('starts a %s that is of its type and not yet complete', (type) => {
		const blank = ITEM_KINDS[type].blank();
		expect(blank.type).toBe(type);
		expect(blank.question).toBe('');
		expect(validateItem(blank).ok).toBe(false);
	});

	it.each(ITEM_TYPES)('starts a %s with no words in any language', (type) => {
		const texts: string[] = [];
		JSON.stringify(ITEM_KINDS[type].blank(), (key, value) => {
			if (key === 'text' && typeof value === 'string') texts.push(value);
			return value;
		});
		expect(texts.join('')).toBe('');
	});

	it('starts each question with ids of its own', () => {
		const first = JSON.stringify(ITEM_KINDS.matching.blank());
		expect(JSON.stringify(ITEM_KINDS.matching.blank())).not.toBe(first);
	});

	it('starts a multiple choice with four empty options, none of them right', () => {
		expect(ITEM_KINDS.mcq.blank()).toEqual({
			type: 'mcq',
			question: '',
			options: Array(4).fill({ text: '', is_correct: false })
		});
	});

	it('starts a matching and an ordering whose keys already point at their rows', () => {
		const matching = ITEM_KINDS.matching.blank();
		const ordering = ITEM_KINDS.ordering.blank();
		if (matching.type !== 'matching' || ordering.type !== 'ordering') throw new Error('wrong type');
		expect(matching.pairs).toEqual(
			matching.left.map((item, row) => ({ left_id: item.id, right_id: matching.right[row].id }))
		);
		expect(ordering.correct_order).toEqual(ordering.items.map((item) => item.id));
	});
});

describe('blankNumeric', () => {
	it.each(NUMERIC_FORMS)('starts a %s answer that is not yet complete', (form) => {
		const blank = blankNumeric(form);
		expect(blank).toMatchObject({ type: 'numeric', question: '' });
		// A plain number is what a Number is when it names no form.
		expect(blank.form).toBe(form === 'number' ? undefined : form);
		// With the question written, what is still missing is the answer itself.
		expect(validateItem({ ...blank, question: 'How many?' }).ok).toBe(false);
	});

	it('leaves the same refusals after a trip through JSON, where an empty number is null', () => {
		for (const form of NUMERIC_FORMS) {
			const blank = blankNumeric(form);
			expect(validateItem(JSON.parse(JSON.stringify(blank)))).toEqual(validateItem(blank));
		}
	});
});

describe('blankOf', () => {
	it('keeps the question, its picture and its tip, and nothing else', () => {
		const mcq = {
			type: 'mcq' as const,
			question: 'Which part takes in water?',
			image_path: 'stages/s/plant.png',
			tip: 'It is under the ground.',
			options: [{ text: 'Root', is_correct: true }]
		};
		expect(blankOf('short_answer', mcq)).toEqual({
			type: 'short_answer',
			question: 'Which part takes in water?',
			image_path: 'stages/s/plant.png',
			tip: 'It is under the ground.',
			accepted_answers: []
		});
	});

	it('leaves the tip behind where the new type has none of its own', () => {
		const tipped = { type: 'true_false' as const, question: 'A?', tip: 'Think.', answer: true };
		for (const type of ITEM_TYPES) {
			expect('tip' in blankOf(type, tipped)).toBe(hasTip(type));
		}
		expect(ITEM_TYPES.filter((type) => !hasTip(type))).toEqual(['mcq', 'mrq']);
	});

	it('adds no picture or tip where there was none', () => {
		const blank = blankOf('true_false', { question: 'A cactus stores water.', tip: null });
		expect(blank).toStrictEqual({
			type: 'true_false',
			question: 'A cactus stores water.',
			answer: true
		});
	});

	it('carries a lead-in that was left out as an empty question', () => {
		const cloze: ClozePayload = { type: 'cloze', text: 'The {{1}}.', blanks: [] };
		expect(blankOf('mcq', cloze).question).toBe('');
	});

	it('hands the question’s picture to a label-a-picture, which needs one', () => {
		expect(blankOf('label_picture', { question: '', image_path: 'a.png' })).toHaveProperty(
			'image_path',
			'a.png'
		);
		expect(blankOf('label_picture', { question: '' })).toHaveProperty('image_path', '');
	});
});

describe('labels', () => {
	it('names every heading, difficulty, answer form and way of answering', () => {
		const named = [
			...KIND_GROUPS.map((group) => KIND_GROUP_LABELS[group]()),
			...DIFFICULTIES.map((difficulty) => DIFFICULTY_LABELS[difficulty]()),
			...NUMERIC_FORMS.map((form) => NUMERIC_FORM_LABELS[form]()),
			...CLOZE_MODES.map((mode) => CLOZE_MODE_LABELS[mode]())
		];
		expect(named.every((label) => label !== '')).toBe(true);
	});
});
