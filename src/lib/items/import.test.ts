import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import {
	checkCandidates,
	fileRefusal,
	MAX_IMPORT_QUESTIONS,
	MAX_WORKBOOK_BYTES,
	planImport,
	type CandidateQuestion,
	type Stored
} from './import.js';
import type { ShortAnswerPayload } from './payload.js';

const short = (question: string): ShortAnswerPayload => ({
	type: 'short_answer',
	question,
	accepted_answers: ['yes']
});

const candidate = (question: string, passage: string | null = null): CandidateQuestion => ({
	payload: short(question),
	difficulty: 'medium',
	passage
});

const empty: Stored = { questions: [], passages: [] };
const rain = { code: 'p1', title: 'Rain', body: 'It rains.' };

describe('fileRefusal', () => {
	it('takes a workbook of up to two megabytes', () => {
		expect(fileRefusal({ name: 'Plants.XLSX', size: MAX_WORKBOOK_BYTES })).toBeNull();
	});

	it('refuses any other kind of file, and one that is too large, each in its own words', () => {
		expect(fileRefusal({ name: 'plants.xls', size: 10 })).toBe(m.practice_import_not_xlsx());
		expect(fileRefusal({ name: 'plants.csv', size: 10 })).toBe(m.practice_import_not_xlsx());
		expect(fileRefusal({ name: 'plants.xlsx', size: MAX_WORKBOOK_BYTES + 1 })).toBe(
			m.practice_import_too_large()
		);
	});
});

describe('planImport', () => {
	it('adds every question to an empty stage, each on its own', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('One?'), candidate('Two?')] },
			empty
		);
		expect(plan).toMatchObject({ passages: [], duplicates: 0 });
		expect(plan.questions.map((each) => [each.payload.question, each.place])).toEqual([
			['One?', null],
			['Two?', null]
		]);
	});

	it('leaves out a question the stage already asks, whatever its capitals', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('ONE? '), candidate('Two?')] },
			{ questions: [short('One?')], passages: [] }
		);
		expect(plan.duplicates).toBe(1);
		expect(plan.questions.map((each) => each.payload.question)).toEqual(['Two?']);
		expect(plan.kept.questions.map((each) => each.payload.question)).toEqual(['Two?']);
	});

	it('leaves out the repeat of an earlier row', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('One?'), candidate('One?'), candidate('one?')] },
			empty
		);
		expect(plan.duplicates).toBe(2);
		expect(plan.questions).toHaveLength(1);
	});

	it('makes the passages its questions join, and puts each question under its own', () => {
		const snow = { code: 'p2', title: 'Snow', body: 'It snows.' };
		const plan = planImport(
			{
				passages: [rain, snow],
				questions: [candidate('Snow one?', 'p2'), candidate('Alone?'), candidate('Rain one?', 'p1')]
			},
			empty
		);
		expect(plan.passages).toEqual([
			{ title: 'Rain', body: 'It rains.' },
			{ title: 'Snow', body: 'It snows.' }
		]);
		expect(plan.questions.map((each) => each.place)).toEqual([
			{ created: 1 },
			null,
			{ created: 0 }
		]);
	});

	it('makes no passage that no added question joins', () => {
		const plan = planImport(
			{ passages: [rain], questions: [candidate('On it?', 'p1'), candidate('Alone?')] },
			{ questions: [short('On it?')], passages: [] }
		);
		expect(plan.passages).toEqual([]);
		expect(plan.kept.passages).toEqual([]);
		expect(plan.questions.map((each) => each.place)).toEqual([null]);
	});

	it('puts a question under the stored passage that reads the same, and makes no second one', () => {
		const plan = planImport(
			{ passages: [rain], questions: [candidate('Old?', 'p1'), candidate('New?', 'p1')] },
			{
				questions: [short('Old?')],
				passages: [{ id: 'stored-rain', title: ' rain', body: 'IT RAINS.' }]
			}
		);
		expect(plan.passages).toEqual([]);
		expect(plan.duplicates).toBe(1);
		expect(plan.questions).toEqual([
			{ payload: short('New?'), difficulty: 'medium', place: { stored: 'stored-rain' } }
		]);
		// The passage goes back with its question, so the import can find the stored one again.
		expect(plan.kept).toEqual({ passages: [rain], questions: [candidate('New?', 'p1')] });
	});

	it('adds nothing the second time the same rows are planned', () => {
		const candidates = {
			passages: [rain],
			questions: [candidate('One?', 'p1'), candidate('Two?')]
		};
		const first = planImport(candidates, empty);
		const second = planImport(first.kept, {
			questions: first.questions.map((each) => each.payload),
			passages: [{ id: 'made', ...first.passages[0] }]
		});
		expect(second).toMatchObject({ passages: [], questions: [], duplicates: 2 });
	});

	it('refuses to plan a question whose passage is not among the candidates', () => {
		expect(() =>
			planImport({ passages: [], questions: [candidate('Lost?', 'p9')] }, empty)
		).toThrow('p9');
	});
});

describe('checkCandidates', () => {
	const posted = (question: unknown, passages: unknown[] = []) => ({
		passages,
		questions: [question]
	});

	it('takes back what a review handed out, tidied again', () => {
		const candidates = {
			passages: [{ code: ' P1 ', title: ' Rain ', body: 'It rains.' }],
			questions: [
				{ payload: { ...short(' One? '), stray: true }, difficulty: 'high', passage: 'P1' }
			]
		};
		expect(checkCandidates(candidates)).toEqual({
			passages: [rain],
			questions: [{ payload: short('One?'), difficulty: 'high', passage: 'p1' }]
		});
		expect(checkCandidates(JSON.parse(JSON.stringify(candidates)))).not.toBeNull();
	});

	it('refuses a question that is not complete', () => {
		expect(checkCandidates(posted(candidate('')))).toBeNull();
		expect(
			checkCandidates(posted({ ...candidate('One?'), payload: { type: 'short_answer' } }))
		).toBeNull();
		expect(checkCandidates(posted({ ...candidate('One?'), difficulty: 'hard' }))).toBeNull();
	});

	it('refuses a question that names a picture, which no workbook can', () => {
		const pictured = { ...short('One?'), image_path: 'stages/other/picture.png' };
		expect(checkCandidates(posted({ ...candidate('One?'), payload: pictured }))).toBeNull();
	});

	it('refuses a passage code that names no passage, or two passages', () => {
		expect(checkCandidates(posted(candidate('One?', 'p1')))).toBeNull();
		expect(
			checkCandidates(posted(candidate('One?', 'p1'), [rain, { ...rain, code: 'P1' }]))
		).toBeNull();
		expect(checkCandidates(posted(candidate('One?', 'p1'), [rain]))).not.toBeNull();
	});

	it('refuses a passage with no title or no text', () => {
		expect(checkCandidates(posted(candidate('One?'), [{ ...rain, title: ' ' }]))).toBeNull();
		expect(checkCandidates(posted(candidate('One?'), [{ ...rain, body: '' }]))).toBeNull();
	});

	it('refuses more questions than a workbook may hold, and anything of another shape', () => {
		const many = Array.from({ length: MAX_IMPORT_QUESTIONS + 1 }, (_, n) => candidate(`Q${n}?`));
		expect(checkCandidates({ passages: [], questions: many })).toBeNull();
		expect(checkCandidates(null)).toBeNull();
		expect(checkCandidates({ questions: [] })).toBeNull();
	});
});
