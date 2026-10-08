import { describe, expect, it } from 'vitest';
import type {
	ClozePayload,
	NumericFractionPayload,
	ShortAnswerPayload,
	TrueFalsePayload
} from '#lib/items/payload.js';
import { Draft, PassageDraft, Uploads, type DraftSource } from './editor.svelte.js';

const BASE = 'https://pictures.test/';

const source = (payload: DraftSource['payload']): DraftSource => ({
	id: 'q1',
	passageId: null,
	difficulty: 'medium',
	payload,
	learningPoints: [{ id: 't1', name: 'plants' }]
});

const short: ShortAnswerPayload = {
	type: 'short_answer',
	question: 'Which part takes in water?',
	accepted_answers: ['root']
};

describe('Draft.dirty', () => {
	it('is clean as it is opened, and dirty once something is changed', () => {
		const draft = new Draft(source(short), BASE);
		expect(draft.dirty).toBe(false);
		draft.payload.question = 'Which part takes in water from the soil?';
		expect(draft.dirty).toBe(true);
		draft.payload.question = short.question;
		expect(draft.dirty).toBe(false);
	});

	it('does not change what it was made from', () => {
		const stored = source(structuredClone(short));
		const draft = new Draft(stored, BASE);
		(draft.payload as ShortAnswerPayload).accepted_answers.push('roots');
		draft.learningPoints.push({ id: 't2', name: 'water' });
		expect(stored.payload).toEqual(short);
		expect(stored.learningPoints).toHaveLength(1);
	});

	it('is clean again after an optional value is written and emptied', () => {
		const draft = new Draft(source(short), BASE);
		for (const empty of ['', undefined, null] as const) {
			draft.payload.tip = 'Under the ground.';
			expect(draft.dirty).toBe(true);
			draft.payload.tip = empty;
			expect(draft.dirty).toBe(false);
		}
	});

	it('is clean again after a switch is turned on and off, whether off was stored or left out', () => {
		const fraction: NumericFractionPayload = {
			type: 'numeric',
			form: 'fraction',
			question: 'How much is left?',
			parts: [3, 4]
		};
		for (const stored of [fraction, { ...fraction, equivalent: false }]) {
			const draft = new Draft(source(stored), BASE);
			const payload = draft.payload as NumericFractionPayload;
			payload.equivalent = true;
			expect(draft.dirty).toBe(true);
			payload.equivalent = undefined;
			expect(draft.dirty).toBe(false);
			payload.equivalent = false;
			expect(draft.dirty).toBe(false);
		}

		const cloze: ClozePayload = {
			type: 'cloze',
			mode: 'bank',
			text: 'The {{1}} take in water.',
			blanks: [{ index: 1, accepted: ['roots'] }],
			reuse: false
		};
		const draft = new Draft(source(cloze), BASE);
		(draft.payload as ClozePayload).reuse = undefined;
		(draft.payload as ClozePayload).distractors = [];
		expect(draft.dirty).toBe(false);
	});

	it('tells an answer that is false from one that is true', () => {
		const statement: TrueFalsePayload = {
			type: 'true_false',
			question: 'Ice is a gas.',
			answer: false
		};
		const draft = new Draft(source(statement), BASE);
		(draft.payload as TrueFalsePayload).answer = true;
		expect(draft.dirty).toBe(true);
	});

	it('counts the difficulty and the learning points, in whatever order they were chosen', () => {
		const draft = new Draft(source(short), BASE);
		draft.difficulty = 'high';
		expect(draft.dirty).toBe(true);
		draft.difficulty = 'medium';

		draft.learningPoints = [
			{ id: 't2', name: 'water' },
			{ id: 't1', name: 'plants' }
		];
		expect(draft.dirty).toBe(true);
		draft.learningPoints = [{ id: 't1', name: 'plants' }];
		expect(draft.dirty).toBe(false);
	});

	it('keeps the question, its picture and its tip when the type is changed', () => {
		const draft = new Draft(source({ ...short, tip: 'Under the ground.' }), BASE);
		draft.setType('true_false');
		expect(draft.payload).toMatchObject({
			type: 'true_false',
			question: short.question,
			tip: 'Under the ground.'
		});
		// The two choice types have no tip of their own, so none is carried into them.
		draft.setType('mcq');
		expect(draft.payload).not.toHaveProperty('tip');
	});
});

describe('PassageDraft.dirty', () => {
	it('is clean as it is opened and after a picture is added and removed again', () => {
		const draft = new PassageDraft(
			{ id: 'p1', content: { title: 'Rain', body: 'It rains.', image_path: null } },
			BASE
		);
		expect(draft.dirty).toBe(false);
		draft.content.image_path = 'upload:one';
		expect(draft.dirty).toBe(true);
		draft.content.image_path = null;
		expect(draft.dirty).toBe(false);
	});
});

describe('Uploads', () => {
	const picture = (name: string) => new File(['x'], name, { type: 'image/png' });

	it('shows a stored picture from the bucket and a picked one from the page', () => {
		const uploads = new Uploads(BASE);
		const picked = uploads.add(picture('a.png'));
		expect(picked).toMatch(/^upload:/);
		expect(uploads.url('stages/s/plant.png')).toBe(`${BASE}stages/s/plant.png`);
		expect(uploads.url(picked)).toMatch(/^blob:/);
		expect(uploads.url(null)).toBeUndefined();
		expect(uploads.url('upload:unknown')).toBeUndefined();
		uploads.clear();
		expect(uploads.url(picked)).toBeUndefined();
	});

	it('hands over the file of each picked picture a payload still names, by its key', () => {
		const uploads = new Uploads(BASE);
		const kept = uploads.add(picture('kept.png'));
		const dropped = uploads.add(picture('dropped.png'));
		const payload = {
			image_path: 'stages/s/plant.png',
			options: [{ image_path: kept }, { image_path: kept }, { image_path: 'upload:unknown' }]
		};
		const files = uploads.filesOf(payload);
		expect(files.map(([key, file]) => [`upload:${key}`, file.name])).toEqual([[kept, 'kept.png']]);
		expect(files.some(([key]) => `upload:${key}` === dropped)).toBe(false);
		uploads.clear();
	});
});
