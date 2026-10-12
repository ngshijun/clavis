import readExcelFile, { parseSheetData, type Schema } from 'read-excel-file/node';
import dataValidation, {
	type DataValidationRule,
	type DataValidationSheetOptions
} from '@onparallel/write-excel-file-data-validation';
import writeExcelFile, {
	getSheetData,
	type Column,
	type Feature,
	type Image,
	type Sheet as WrittenSheet
} from 'write-excel-file/node';
import {
	findElement,
	getCellAddress,
	getChildElements,
	getSelfClosingTagMarkup,
	setMarkupInsideElement
} from 'write-excel-file/utility';
import { uploadRef } from '#lib/item-images.js';
import {
	fileRefusal,
	MAX_IMPORT_QUESTIONS,
	type Candidates,
	type ImportProblem,
	type OfferedPoint
} from '#lib/items/import.js';
import {
	EXAMPLE_MARK,
	exampleRow,
	PASSAGE_SHEET,
	README,
	README_NAME,
	readRows,
	SHEETS,
	type Cells,
	type Pictures,
	type RowProblem,
	type Sheet,
	type SheetRow
} from '#lib/items/sheets.js';
import { m } from '#lib/paraglide/messages.js';
import { readPictures, type PlacedPicture } from './workbook-pictures.js';

/**
 * The import workbook as a file: the template written out, and a filled
 * workbook read back into rows. What the sheets are and what a row means is
 * `items/sheets`; here is only the spreadsheet.
 */

/**
 * A cell as the text a person sees in it. A sheet's cells are all read as
 * text, whatever Excel made of them: a number typed as an answer and TRUE
 * typed under Answer are still what the teacher wrote. A date is not: Excel
 * turns 3/4 into the fourth of March and keeps no trace of what was typed, so
 * the row is refused and says so.
 */
function text(value: unknown): string {
	if (value instanceof Date) throw new Error('date');
	return typeof value === 'boolean' ? String(value).toUpperCase() : String(value);
}

/**
 * A sheet's name or a column's header as it is compared: a teacher's
 * `question ` or `ACCEPTED ANSWERS` is the template's `Question` and
 * `Accepted Answers`.
 */
const plain = (written: unknown) =>
	String(written ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();

/** How a sheet's rows are read: each column found by its header, every cell as text. */
function schemaOf(sheet: Sheet): Schema<Cells> {
	return Object.fromEntries(
		sheet.columns.map((column) => [column.key, { column: column.header, type: text }])
	);
}

/**
 * The fingerprints of the pictures of a workbook that can be used, by each
 * picture's name in the file. The page says which those are, because the
 * workbook is sent without them.
 */
export type PictureMarks = Map<string, string>;

/**
 * The pictures of one row by the key of the column each is in, as a question
 * names a picture not stored yet, or what is wrong with where one is.
 */
function picturesOf(
	sheet: Sheet,
	header: unknown[],
	placed: PlacedPicture[],
	marks: PictureMarks
): { pictures: Pictures } | { fault: RowProblem } {
	const pictures: Pictures = {};
	for (const { column, media } of placed) {
		const found = sheet.columns.find((each) => each.header === header[column]);
		if (!found) return { fault: { column: null, message: m.practice_import_picture_outside() } };
		const refused = (message: string) => ({ fault: { column: found.header, message } });
		if (!found.picture) return refused(m.practice_import_picture_misplaced());
		if (found.key in pictures) return refused(m.practice_import_picture_two());
		const mark = marks.get(media);
		if (!mark) return refused(m.practice_import_picture_unusable());
		pictures[found.key] = uploadRef(mark);
	}
	return { pictures };
}

/**
 * The rows under a sheet's header, each as its cells and pictures or as why
 * they could not be read. A picture below the last row that has words makes
 * a row of its own.
 */
function rowsOf(
	sheet: Sheet,
	header: unknown[],
	rows: unknown[][],
	placed: PlacedPicture[],
	marks: PictureMarks
): SheetRow[] {
	const schema = schemaOf(sheet);
	// The header is row 1, so the first row under it is row 2.
	const numbers = new Set([
		...rows.map((_, index) => index + 2),
		...placed.map((picture) => picture.row).filter((row) => row > 1)
	]);
	return [...numbers]
		.sort((a, b) => a - b)
		.map((row): SheetRow => {
			// One row at a time: a cell that cannot be read fails its row and not the sheet.
			const { objects, errors } = parseSheetData<Cells>(
				[header, rows[row - 2] ?? []] as never,
				schema,
				{ propertyValueWhenCellIsEmpty: '', propertyValueWhenColumnIsMissing: '' }
			);
			if (errors) {
				return { row, fault: { column: errors[0].column, message: m.practice_import_date_cell() } };
			}
			const here = placed.filter((picture) => picture.row === row);
			const read = picturesOf(sheet, header, here, marks);
			// A row with nothing in the sheet's columns comes back as no object at all.
			return 'fault' in read ? { row, ...read } : { row, cells: objects[0] ?? {}, ...read };
		});
}

export type WorkbookReading =
	| { ok: true; candidates: Candidates; problems: ImportProblem[] }
	/** The file as a whole is refused, and `message` says why. */
	| { ok: false; message: string };

/**
 * Reads a filled workbook. A sheet is known by its name, so the sheets a
 * teacher did not need may be deleted and the Read me sheet is passed over.
 *
 * The workbook arrives without its pictures. Where each one sits is still in
 * it, and `marks` says which of them can be used; a row names its pictures
 * `upload:<fingerprint>`. `offered` are the learning points a row may name:
 * those of the topic of the stage the workbook is read for.
 */
export async function readWorkbook(
	file: File,
	marks: PictureMarks = new Map(),
	offered: OfferedPoint[] = []
): Promise<WorkbookReading> {
	const refusal = fileRefusal(file);
	if (refusal) return { ok: false, message: refusal };

	let workbook: Awaited<ReturnType<typeof readExcelFile>>;
	let pictures: ReturnType<typeof readPictures>;
	try {
		const bytes = Buffer.from(await file.arrayBuffer());
		workbook = await readExcelFile(bytes);
		pictures = readPictures(bytes);
	} catch {
		// Not a workbook under its name: an old .xls renamed, a damaged file, an empty one.
		return { ok: false, message: m.practice_import_unreadable() };
	}

	const problems: ImportProblem[] = [];
	const read: { sheet: Sheet; rows: SheetRow[] }[] = [];
	for (const sheet of SHEETS) {
		const found = workbook.find((each) => plain(each.sheet) === plain(sheet.name));
		if (!found) continue;
		const [written = [], ...rows] = found.data;
		// Each header as the template writes it, so a column is found whatever its capitals.
		const header = written.map(
			(cell) => sheet.columns.find((column) => plain(column.header) === plain(cell))?.header ?? cell
		);
		/*
		 * A header row that is not the template's means the file was made from another template,
		 * and nothing in it can be trusted to mean what it does here: a column this template
		 * lacks would be passed over without a word, and the example rows of an older template
		 * are not marked as examples and would be imported as questions. So the file is refused
		 * whole, whichever sheet shows it. The columns may stand in any order.
		 */
		const titles = header.filter((cell) => cell !== null && cell !== '');
		if (
			titles.length !== sheet.columns.length ||
			!sheet.columns.every((column) => titles.includes(column.header))
		) {
			return { ok: false, message: m.practice_import_other_template({ sheet: sheet.name }) };
		}
		const placed = pictures.get(found.sheet) ?? [];
		if (rows.length === 0 && placed.length === 0) {
			read.push({ sheet, rows: [] });
			continue;
		}

		// A picture has slid up over the header: it is said, and the rows are read all the same.
		if (placed.some((picture) => picture.row === 1)) {
			problems.push({ sheet: sheet.name, row: 1, reason: m.practice_import_picture_header() });
		}
		read.push({ sheet, rows: rowsOf(sheet, header, rows, placed, marks) });
	}
	if (read.length === 0 && problems.length === 0) {
		return { ok: false, message: m.practice_import_no_sheets() };
	}

	const rows = readRows(read, offered);
	if (rows.questionRows > MAX_IMPORT_QUESTIONS) {
		return {
			ok: false,
			message: m.practice_import_too_many({ count: rows.questionRows, max: MAX_IMPORT_QUESTIONS })
		};
	}
	const all = [...problems, ...rows.problems];
	if (rows.questionRows === 0 && all.length === 0) {
		return { ok: false, message: m.practice_import_empty() };
	}
	// In the order of the sheets, as a teacher goes through the file.
	const place = (problem: ImportProblem) =>
		SHEETS.findIndex((sheet) => sheet.name === problem.sheet);
	return {
		ok: true,
		candidates: rows.candidates,
		problems: all.sort((a, b) => place(a) - place(b) || a.row - b.row)
	};
}

/** The last row of a sheet that is made ready to type into: the header, the example, and all a workbook may hold. */
const LAST_ROW = MAX_IMPORT_QUESTIONS + 2;

const HEADER = { fontWeight: 'bold', backgroundColor: '#EDE7FB' } as const;
const EXAMPLE = { backgroundColor: '#FFF2CC' } as const;

/** What the features below read off a sheet, beside what the writer takes. */
type TemplateOptions = DataValidationSheetOptions & { textColumns?: boolean };
type FileContent = Image['content'];
type TemplateSheet = WrittenSheet<FileContent> & TemplateOptions;

/**
 * Gives every column of a sheet that asks for it the format of the sheet's
 * example row, which is Text. A cell typed into a column takes the column's
 * format, and Text is what stops Excel from turning 3/4 into a date and 7:30
 * into a time of day. The rows below the example need not be written for it.
 */
const textColumns: Feature<FileContent> = {
	files: {
		transform: {
			'xl/worksheets/sheet{id}.xml': {
				transform(xml, sheet) {
					const columns = findElement(xml, 'cols');
					const rows = findElement(xml, 'sheetData');
					if (!(sheet as TemplateOptions).textColumns || !columns || !rows) return xml;
					const example = getChildElements(xml, rows)[1];
					const style = example && getChildElements(xml, example)[0]?.openingTagAttributes.s;
					if (style === undefined) throw new Error('The example row has no format to give');
					// The columns come before the rows, so writing them anew moves nothing that was read.
					return setMarkupInsideElement(
						xml,
						columns,
						getChildElements(xml, columns)
							.map((column) =>
								getSelfClosingTagMarkup('col', { ...column.openingTagAttributes, style })
							)
							.join('')
					);
				}
			}
		}
	}
};

/** Every row of one column that may be typed into. Columns are counted from 1 here. */
const below = (column: number) => ({
	from: { row: 2, column },
	to: { row: LAST_ROW, column }
});

/** The titles on the Passages sheet, as a list a cell of another sheet picks from. */
function passageTitles(): string {
	const column = PASSAGE_SHEET.columns.findIndex((each) => each.key === 'title');
	const letter = getCellAddress(0, column).replace(/\d+$/, '');
	return `'${PASSAGE_SHEET.name}'!$${letter}$2:$${letter}$${LAST_ROW}`;
}

/** The list each cell of a column is picked from, for the columns that have one. */
function listsOf(sheet: Sheet): DataValidationRule[] {
	return sheet.columns.flatMap((column, index): DataValidationRule[] => {
		if (column.choices) {
			const values = [...column.choices];
			return [
				{
					cellRange: below(index + 1),
					validation: {
						type: 'list',
						values,
						errorTitle: column.header,
						error: `Pick one from the list: ${values.join(', ')}.`
					}
				}
			];
		}
		if (column.passages) {
			return [
				{
					cellRange: below(index + 1),
					validation: {
						type: 'list',
						valuesRange: passageTitles(),
						errorTitle: column.header,
						error: `Pick a title from the list. Write the passage on the ${PASSAGE_SHEET.name} sheet first.`
					}
				}
			];
		}
		return [];
	});
}

/**
 * A sheet of the template: its header and its example. The example is shown
 * in yellow for as long as it begins with the mark that keeps it from being
 * imported, so a row a teacher typed over it is no longer yellow.
 */
function templateSheet(sheet: Sheet): TemplateSheet {
	const columns = sheet.columns.map((column): Column<Cells> => ({
		header: { value: column.header, ...HEADER },
		cell: (row) => ({ value: row[column.key] ?? '', type: String, format: '@' }),
		width: column.width
	}));
	return {
		sheet: sheet.name,
		data: getSheetData([exampleRow(sheet)], columns),
		columns,
		textColumns: true,
		// The header stays in sight going down, and what is asked stays in sight going across.
		stickyRowsCount: 1,
		stickyColumnsCount: 1,
		conditionalFormatting: [
			{
				cellRange: { from: { row: 2, column: 1 }, to: { row: LAST_ROW, column: columns.length } },
				condition: { formula: `LEFT($A2,${EXAMPLE_MARK.length})="${EXAMPLE_MARK}"` },
				style: EXAMPLE
			}
		],
		dataValidation: listsOf(sheet)
	};
}

/** The first sheet: how the file is used, in short parts, then a part for each sheet. */
function readMeSheet(): TemplateSheet {
	const line = (value: string) => [{ value, wrap: true, alignVertical: 'top' as const }];
	return {
		sheet: README_NAME,
		columns: [{ width: 110 }],
		showGridLines: false,
		data: [
			[{ value: README.title, fontWeight: 'bold', fontSize: 16 }],
			...README.parts.flatMap(({ heading, lines }) => [
				[],
				[{ value: heading, ...HEADER }],
				...lines.map(line)
			])
		]
	};
}

/** The empty workbook a teacher downloads: the Read me, a sheet a type, and the passages. */
export async function writeTemplate(): Promise<Buffer> {
	return writeExcelFile([readMeSheet(), ...SHEETS.map(templateSheet)], {
		features: [dataValidation, textColumns]
	}).toBuffer();
}
