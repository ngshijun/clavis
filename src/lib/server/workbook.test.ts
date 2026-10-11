import { strFromU8, unzipSync } from 'fflate';
import readExcelFile from 'read-excel-file/node';
import writeExcelFile, { type SheetData } from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_QUESTIONS, MAX_WORKBOOK_BYTES } from '#lib/items/import.js';
import {
	exampleRow,
	PASSAGE_SHEET,
	QUESTION_SHEETS,
	README_NAME,
	SHEETS,
	type Sheet
} from '#lib/items/sheets.js';
import { m } from '#lib/paraglide/messages.js';
import { splitWorkbook } from '#lib/workbook.js';
import { readWorkbook, writeTemplate } from './workbook.js';

const file = (content: Buffer | string, name = 'questions.xlsx') =>
	new File([typeof content === 'string' ? content : new Uint8Array(content)], name);

/** A workbook of the sheets given, each as its rows of cells. */
async function workbook(sheets: Record<string, SheetData>, name?: string): Promise<File> {
	const written = await writeExcelFile(
		Object.entries(sheets).map(([sheet, data]) => ({ sheet, data }))
	).toBuffer();
	return file(written, name);
}

const sheetNamed = (name: string) => {
	const sheet = SHEETS.find((each) => each.name === name);
	if (!sheet) throw new Error(`No sheet ${name}`);
	return sheet;
};
const headers = (sheet: Sheet) => sheet.columns.map((column) => column.header);
/** A row of a sheet: its example, with the cells given (by header) written over it. */
const rowOf = (sheet: Sheet, cells: Record<string, unknown> = {}) =>
	sheet.columns.map((column) =>
		column.header in cells ? cells[column.header] : (sheet.sample[column.key] ?? null)
	) as never[];

/** The example of a sheet as the template writes it, which is never imported. */
const exampleOf = (sheet: Sheet) =>
	sheet.columns.map((column) => exampleRow(sheet)[column.key] ?? null) as never[];

const short = sheetNamed('Short Answer');
const number = sheetNamed('Number');

async function read(sheets: Record<string, SheetData>) {
	const reading = await readWorkbook(await workbook(sheets));
	if (!reading.ok) throw new Error(reading.message);
	return reading;
}

describe('writeTemplate', () => {
	it('writes the Read me, then a sheet a type, then the passages', async () => {
		const sheets = await readExcelFile(await writeTemplate());
		expect(sheets.map((each) => each.sheet)).toEqual([
			README_NAME,
			...QUESTION_SHEETS.map((sheet) => sheet.name),
			PASSAGE_SHEET.name
		]);
	});

	it('gives each sheet its header row and its example, and nothing else', async () => {
		const sheets = await readExcelFile(await writeTemplate());
		for (const sheet of SHEETS) {
			const written = sheets.find((each) => each.sheet === sheet.name)?.data;
			expect(written).toEqual([headers(sheet), exampleOf(sheet)]);
		}
	});

	it('makes every column Text, shows the example in yellow, and offers the lists', async () => {
		const parts = unzipSync(new Uint8Array(await writeTemplate()));
		const styles = strFromU8(parts['xl/styles.xml']);
		const formats = [...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="@"\/>/g)];
		const text = [
			...(/<cellXfs[^>]*>(.*)<\/cellXfs>/s.exec(styles)?.[1] ?? '').matchAll(/<xf[^>]*>/g)
		]
			.map(([xf]) => xf)
			.findIndex((xf) => formats.some(([, id]) => xf.includes(`numFmtId="${id}"`)));
		expect(text).toBeGreaterThan(0);

		// The Read me is the first sheet of the file.
		SHEETS.forEach((sheet, index) => {
			const xml = strFromU8(parts[`xl/worksheets/sheet${index + 2}.xml`]);
			const columns = [...xml.matchAll(/<col [^>]*>/g)].map(([column]) => column);
			expect(columns).toHaveLength(sheet.columns.length);
			for (const column of columns) expect(column).toContain(`style="${text}"`);
			// Only the header and the example are written, so the file stays small.
			expect(xml.match(/<row /g)).toHaveLength(2);

			expect(xml).toContain('<formula>LEFT($A2,8)="Example:"</formula>');
			const lists = sheet.columns.filter((column) => column.choices || column.passages);
			expect(xml.match(/<dataValidation /g) ?? []).toHaveLength(lists.length);
		});

		const choice = strFromU8(parts['xl/worksheets/sheet2.xml']);
		expect(choice).toContain('<formula1>"Low,Medium,High"</formula1>');
		expect(choice).toContain("<formula1>'Passages'!$A$2:$A$502</formula1>");
		expect(choice).toContain('state="frozen"');
	});

	it('explains every sheet on the Read me', async () => {
		const [readMe] = await readExcelFile(await writeTemplate());
		const lines = readMe.data.map((row) => row[0]);
		for (const sheet of SHEETS) {
			expect(lines).toContain(sheet.name);
			for (const note of sheet.notes) expect(lines).toContain(note);
		}
	});
});

describe('readWorkbook', () => {
	it('refuses the template as it was downloaded, and points at filling it in', async () => {
		const reading = await readWorkbook(file(await writeTemplate()));
		expect(reading).toEqual({ ok: false, message: m.practice_import_empty() });
	});

	it('reads a question typed under the example of the template’s own sheet', async () => {
		const reading = await read({
			[README_NAME]: [['Importing practice questions into Clavis']],
			'Short Answer': [
				headers(short),
				exampleOf(short),
				rowOf(short, { Question: 'Which gas do animals breathe in?', 'Accepted Answers': 'oxygen' })
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toEqual([
			{
				payload: {
					type: 'short_answer',
					question: 'Which gas do animals breathe in?',
					accepted_answers: ['oxygen']
				},
				difficulty: 'medium',
				passage: null
			}
		]);
	});

	it('knows a sheet by its name in any capitals, and passes over the ones it does not know', async () => {
		const reading = await read({
			Notes: [['Mine'], ['Do not read this.']],
			' short answer ': [headers(short), rowOf(short, { Question: 'One?' })]
		});
		expect(reading.candidates.questions).toHaveLength(1);
	});

	it('ignores empty rows, between the questions and after them', async () => {
		const empty = short.columns.map(() => null);
		// A cell with only a format, as the template's waiting rows have.
		const formatted = short.columns.map(() => ({ value: '', type: String, format: '@' }));
		const reading = await read({
			'Short Answer': [
				headers(short),
				rowOf(short, { Question: 'One?' }),
				empty,
				rowOf(short, { Question: '' }),
				formatted,
				formatted
			]
		});
		expect(reading.candidates.questions.map((each) => each.payload.question)).toEqual(['One?']);
		expect(reading.problems).toEqual([
			{
				sheet: 'Short Answer',
				row: 4,
				reason: m.practice_import_at_column({
					column: 'Question',
					message: m.item_question_required()
				})
			}
		]);
	});

	it('reads a number and a boolean as what was typed', async () => {
		const trueFalse = sheetNamed('True or False');
		const reading = await read({
			Number: [
				headers(number),
				rowOf(number, {
					Question: 'Half of 25?',
					'Answer Form': null,
					Answer: 12.5,
					'Accept Equal Answers': null
				})
			],
			'True or False': [
				headers(trueFalse),
				rowOf(trueFalse, { Statement: 'Ice is a solid.', Answer: true })
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions.map((each) => each.payload)).toMatchObject([
			{ type: 'true_false', answer: true },
			{ type: 'numeric', answer: 12.5 }
		]);
	});

	it('knows a column by its header in any capitals, and with spaces around it', async () => {
		const written = headers(short).map(
			(header) => `  ${header.toUpperCase().replace(' ', '   ')} `
		);
		const reading = await read({
			'Short Answer': [written, rowOf(short, { Question: 'One?', 'Accepted Answers': 'yes' })]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toMatchObject([
			{ payload: { question: 'One?', accepted_answers: ['yes'] } }
		]);
	});

	it('holds back a row whose cell Excel has turned into a date, and names the cell', async () => {
		const reading = await read({
			Number: [
				headers(number),
				rowOf(number, {
					Question: 'What fraction is shaded?',
					Answer: { value: new Date(Date.UTC(2026, 2, 4)), type: Date, format: 'd-mmm' }
				})
			]
		});
		expect(reading.candidates.questions).toEqual([]);
		expect(reading.problems).toEqual([
			{
				sheet: 'Number',
				row: 2,
				reason: m.practice_import_at_column({
					column: 'Answer',
					message: m.practice_import_date_cell()
				})
			}
		]);
	});

	it('reads a sheet whose columns were moved', async () => {
		const moved = [...headers(short)].reverse();
		const reading = await read({
			'Short Answer': [
				moved,
				moved.map((header) => ({ Question: 'One?', 'Accepted Answers': 'yes' })[header] ?? null)
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toMatchObject([
			{ payload: { question: 'One?', accepted_answers: ['yes'] }, difficulty: 'medium' }
		]);
	});

	it('refuses a file with a sheet whose columns are not the template’s, and names the sheet', async () => {
		const refused = { ok: false, message: m.practice_import_other_template({ sheet: short.name }) };
		const row = rowOf(short, { Question: 'One?' });
		const others = {
			// A column the template does not have, whose cells would be passed over.
			added: [
				[...headers(short), 'My notes'],
				[...row, 'ask Aina']
			],
			// A column of the template's that is gone.
			removed: [headers(short).slice(0, -1), row.slice(0, -1)],
			renamed: [headers(short).map((header) => (header === 'Question' ? 'Soalan' : header)), row],
			twice: [
				[...headers(short), 'Question'],
				[...row, 'Two?']
			]
		};
		for (const data of Object.values(others)) {
			expect(await readWorkbook(await workbook({ 'Short Answer': data }))).toEqual(refused);
		}
	});

	it('refuses the whole file for one such sheet, so no row of another template is read', async () => {
		// An older template: this sheet's columns are today's, but its example row is not marked as one.
		const reading = await readWorkbook(
			await workbook({
				'Short Answer': [headers(short), rowOf(short)],
				Number: [[...headers(number), 'Tip 2'], rowOf(number)]
			})
		);
		expect(reading).toEqual({
			ok: false,
			message: m.practice_import_other_template({ sheet: number.name })
		});
	});

	it('joins questions to the passages of the Passages sheet', async () => {
		const reading = await read({
			Passages: [headers(PASSAGE_SHEET), ['雨', null, '下雨了。\n天空很暗。']],
			'Short Answer': [headers(short), rowOf(short, { Question: '天气怎样？', Passage: '雨' })]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates).toMatchObject({
			passages: [{ title: '雨', body: '下雨了。\n天空很暗。' }],
			questions: [{ passage: '雨', payload: { question: '天气怎样？' } }]
		});
	});

	it('lists the rows to fix sheet by sheet as the template has them', async () => {
		const reading = await read({
			Passages: [headers(PASSAGE_SHEET), ['', null, 'No title.']],
			'Short Answer': [headers(short), rowOf(short, { Question: '' })],
			Number: [headers(number), rowOf(number, { Answer: 'three quarters' })]
		});
		expect(reading.problems.map((each) => [each.sheet, each.row])).toEqual([
			['Short Answer', 2],
			['Number', 2],
			['Passages', 2]
		]);
	});

	it('refuses a file that is not an .xlsx, or too large, before it is opened', async () => {
		expect(await readWorkbook(file('a,b', 'questions.csv'))).toEqual({
			ok: false,
			message: m.practice_import_not_xlsx()
		});
		const large = file('x'.repeat(MAX_WORKBOOK_BYTES + 1));
		expect(await readWorkbook(large)).toEqual({
			ok: false,
			message: m.practice_import_too_large()
		});
	});

	it('refuses a file that is a workbook only by its name', async () => {
		for (const content of ['', 'Question,Answer\nOne?,yes']) {
			expect(await readWorkbook(file(content))).toEqual({
				ok: false,
				message: m.practice_import_unreadable()
			});
		}
	});

	it('refuses a workbook with none of the sheets, and points at the template', async () => {
		const reading = await readWorkbook(await workbook({ Sheet1: [['Question'], ['One?']] }));
		expect(reading).toEqual({ ok: false, message: m.practice_import_no_sheets() });
	});

	it('refuses a workbook with only headers, or only passages', async () => {
		const empty = await readWorkbook(await workbook({ 'Short Answer': [headers(short)] }));
		expect(empty).toEqual({ ok: false, message: m.practice_import_empty() });
		const passages = await readWorkbook(
			await workbook({ Passages: [headers(PASSAGE_SHEET), ['Rain', null, 'It rains.']] })
		);
		expect(passages).toEqual({ ok: false, message: m.practice_import_empty() });
	});

	it('refuses more question rows than one workbook may hold', async () => {
		const rows = Array.from({ length: MAX_IMPORT_QUESTIONS + 1 }, (_, n) =>
			rowOf(short, { Question: `Question ${n}?` })
		);
		const full = await readWorkbook(
			await workbook({ 'Short Answer': [headers(short), ...rows.slice(1)] })
		);
		expect(full).toMatchObject({ ok: true });
		const over = await readWorkbook(await workbook({ 'Short Answer': [headers(short), ...rows] }));
		expect(over).toEqual({
			ok: false,
			message: m.practice_import_too_many({
				count: MAX_IMPORT_QUESTIONS + 1,
				max: MAX_IMPORT_QUESTIONS
			})
		});
	});
});

describe('readWorkbook, with pictures', () => {
	const choice = sheetNamed('Multiple Choice');

	/** A picture of a sheet, known by `name`, its top left corner in the cell of a column and a row. */
	const picture = (sheet: Sheet, header: string | number, row: number, name: string) => ({
		content: Buffer.from(name),
		contentType: 'image/png',
		width: 10,
		height: 10,
		dpi: 96,
		anchor: {
			row,
			column: typeof header === 'number' ? header : headers(sheet).indexOf(header) + 1
		}
	});
	/** What stands for the fingerprint of the picture known by `name`. */
	const mark = (name: string) => Buffer.from(name).toString('hex').padEnd(32, '0').slice(0, 32);
	const named = (name: string) => `upload:${mark(name)}`;

	/**
	 * Reads a workbook as the page sends it: without its pictures, and with
	 * the fingerprint of each one that can be used.
	 */
	async function readPictured(
		sheets: { sheet: string; data: SheetData; images?: ReturnType<typeof picture>[] }[],
		unusable: string[] = []
	) {
		const written = await writeExcelFile(sheets as never).toBuffer();
		const { workbook: stripped, media } = splitWorkbook(new Uint8Array(written));
		const marks = new Map<string, string>();
		for (const [path, bytes] of media) {
			const name = Buffer.from(bytes).toString();
			if (!unusable.includes(name)) marks.set(path, mark(name));
		}
		const reading = await readWorkbook(file(Buffer.from(stripped)), marks);
		if (!reading.ok) throw new Error(reading.message);
		return reading;
	}

	it('gives a question the picture in its Picture cell, and an option the one in its own', async () => {
		const reading = await readPictured([
			{
				sheet: choice.name,
				data: [
					headers(choice),
					exampleOf(choice),
					rowOf(choice, {
						Question: 'Which is the root?',
						'Option B': null,
						'Option B Tip': null
					})
				],
				images: [
					picture(choice, 'Picture', 3, 'plant'),
					picture(choice, 'Option A Picture', 3, 'roots'),
					picture(choice, 'Option B Picture', 3, 'stem')
				]
			}
		]);
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions.map((each) => each.payload)).toEqual([
			{
				type: 'mcq',
				question: 'Which is the root?',
				image_path: named('plant'),
				options: [
					{ text: 'Roots', image_path: named('roots'), is_correct: true },
					{ text: '', image_path: named('stem'), is_correct: false },
					{ text: 'Leaf', is_correct: false, tip: 'A leaf makes food from sunlight.' },
					{ text: 'Flower', is_correct: false }
				]
			}
		]);
	});

	it('reads a question with a picture, and a passage that is only a picture', async () => {
		const reading = await readPictured([
			{
				sheet: short.name,
				data: [headers(short), rowOf(short, { Passage: 'A poster' })],
				images: [picture(short, 'Picture', 2, 'leaf')]
			},
			{
				sheet: PASSAGE_SHEET.name,
				data: [headers(PASSAGE_SHEET), ['A Poster', null, null]],
				images: [picture(PASSAGE_SHEET, 'Picture', 2, 'poster')]
			}
		]);
		expect(reading.problems).toEqual([]);
		expect(reading.candidates).toMatchObject({
			passages: [{ title: 'A Poster', body: '', image_path: named('poster') }],
			questions: [{ passage: 'a poster', payload: { image_path: named('leaf') } }]
		});
	});

	it('holds back a row whose picture is where none is taken, and says where', async () => {
		const row = (question: string) => rowOf(short, { Question: question });
		const reading = await readPictured(
			[
				{
					sheet: short.name,
					data: [
						headers(short),
						row('One?'),
						row('Two?'),
						row('Three?'),
						row('Four?'),
						row('Five?')
					],
					images: [
						picture(short, 'Picture', 1, 'slid up'),
						picture(short, 'Accepted Answers', 2, 'misplaced'),
						picture(short, headers(short).length + 3, 3, 'outside'),
						picture(short, 'Picture', 4, 'first'),
						picture(short, 'Picture', 4, 'second'),
						picture(short, 'Picture', 5, 'drawing'),
						picture(short, 'Picture', 6, 'good'),
						picture(short, 'Picture', 9, 'alone')
					]
				}
			],
			['drawing']
		);
		const at = (column: string, message: string) =>
			m.practice_import_at_column({ column, message });
		expect(reading.problems).toEqual([
			{ sheet: short.name, row: 1, reason: m.practice_import_picture_header() },
			{
				sheet: short.name,
				row: 2,
				reason: at('Accepted Answers', m.practice_import_picture_misplaced())
			},
			{ sheet: short.name, row: 3, reason: m.practice_import_picture_outside() },
			{ sheet: short.name, row: 4, reason: at('Picture', m.practice_import_picture_two()) },
			{ sheet: short.name, row: 5, reason: at('Picture', m.practice_import_picture_unusable()) },
			// A picture under the last question is a row of its own, which asks nothing.
			{ sheet: short.name, row: 9, reason: at('Question', m.item_question_required()) }
		]);
		expect(reading.candidates.questions.map((each) => each.payload)).toMatchObject([
			{ question: 'Five?', image_path: named('good') }
		]);
	});

	it('refuses words typed where the picture goes', async () => {
		const reading = await readPictured([
			{ sheet: short.name, data: [headers(short), rowOf(short, { Picture: 'leaf.png' })] }
		]);
		expect(reading.problems).toEqual([
			{
				sheet: short.name,
				row: 2,
				reason: m.practice_import_at_column({
					column: 'Picture',
					message: m.practice_import_picture_words()
				})
			}
		]);
	});
});
