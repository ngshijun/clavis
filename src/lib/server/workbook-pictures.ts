import { strFromU8, unzipSync } from 'fflate';
import { Parser } from 'saxen';

/**
 * Where the pictures of a workbook sit. A workbook keeps a picture in one of
 * two ways, and both are read:
 *
 * - Floating over the sheet, which is all a picture could be before Excel 365
 *   and is what Google Sheets, LibreOffice and WPS write. The sheet's drawing
 *   anchors it to the cell its top left corner is in.
 * - In a cell (Excel 365's Place in Cell). The cell's value is the picture,
 *   named through the workbook's rich values.
 *
 * Only where a picture is, and which file of the workbook it is, is read
 * here. The pictures' bytes are not asked for, so the workbook may come
 * without them.
 */

/** A picture of a sheet, and the cell it is in. */
export interface PlacedPicture {
	/** The number the spreadsheet shows beside the row. */
	row: number;
	/** The column, counted from 0. */
	column: number;
	/** The picture's name in the workbook file, such as `xl/media/image1.png`. */
	media: string;
}

type Parts = Record<string, Uint8Array>;
type Attributes = Record<string, string>;

/** A name as it is compared: without the prefix its namespace was given, which a writer is free to choose. */
const local = (name: string) => name.slice(name.indexOf(':') + 1);

/**
 * Goes through a part of the workbook, element by element. A part the
 * workbook lacks has no elements. `text` is what an element holds directly,
 * and `inside` the names of the elements it is in, the nearest last.
 */
function scan(
	parts: Parts,
	part: string,
	visit: {
		open?: (name: string, attributes: Attributes, inside: string[]) => void;
		text?: (text: string, inside: string[]) => void;
		close?: (name: string) => void;
	}
): void {
	const bytes = parts[part];
	if (!bytes) return;

	const inside: string[] = [];
	const parser = new Parser();
	parser.on('openTag', (name, attributes, _decode, selfClosing) => {
		const element = local(name);
		visit.open?.(
			element,
			Object.fromEntries(Object.entries(attributes()).map(([key, value]) => [local(key), value])),
			inside
		);
		if (selfClosing) visit.close?.(element);
		else inside.push(element);
	});
	parser.on('text', (text) => visit.text?.(text, inside));
	parser.on('closeTag', (name, _decode, selfClosing) => {
		if (selfClosing) return;
		inside.pop();
		visit.close?.(local(name));
	});
	parser.parse(strFromU8(bytes));
}

/**
 * A relationship's target as a path in the file. It is written from the
 * folder of the part that names it, or from the top with a leading slash.
 */
function targetPath(part: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1);
	const path = part.split('/').slice(0, -1);
	for (const step of target.split('/')) {
		if (step === '..') path.pop();
		else if (step !== '.') path.push(step);
	}
	return path.join('/');
}

/** What a part points at inside the file, by the id it gives each: the kind of thing, and where it is. */
function relationships(parts: Parts, part: string): Map<string, { type: string; path: string }> {
	const cut = part.lastIndexOf('/') + 1;
	const found = new Map<string, { type: string; path: string }>();
	scan(parts, `${part.slice(0, cut)}_rels/${part.slice(cut)}.rels`, {
		open(name, { Id, Type, Target, TargetMode }) {
			// A linked picture is somewhere else, and nothing of it is in the file.
			if (name !== 'Relationship' || TargetMode === 'External' || !Id || !Target) return;
			// The kind is the end of a long name: `…/relationships/drawing`.
			found.set(Id, { type: Type?.split('/').at(-1) ?? '', path: targetPath(part, Target) });
		}
	});
	return found;
}

const ANCHORS = ['twoCellAnchor', 'oneCellAnchor'];

/** The pictures that float over a sheet, each at the cell its top left corner is in. */
function floating(parts: Parts, sheet: string): PlacedPicture[] {
	const placed: PlacedPicture[] = [];
	for (const drawing of relationships(parts, sheet).values()) {
		if (drawing.type !== 'drawing') continue;
		const files = relationships(parts, drawing.path);

		/** The anchor being read: where it is from, and the pictures in it. */
		let anchor: { column?: number; row?: number; media: string[] } | null = null;
		scan(parts, drawing.path, {
			open(name, attributes) {
				if (ANCHORS.includes(name)) anchor = { media: [] };
				const file = name === 'blip' ? files.get(attributes.embed) : undefined;
				if (file && anchor) anchor.media.push(file.path);
			},
			text(text, inside) {
				if (!anchor || inside.at(-2) !== 'from') return;
				// Counted from 0 in the file, as columns are here; a row is shown counted from 1.
				if (inside.at(-1) === 'col') anchor.column = Number(text);
				if (inside.at(-1) === 'row') anchor.row = Number(text) + 1;
			},
			close(name) {
				if (!anchor || !ANCHORS.includes(name)) return;
				const { column, row, media } = anchor;
				anchor = null;
				if (column === undefined || row === undefined) return;
				for (const each of media) placed.push({ row, column, media: each });
			}
		});
	}
	return placed;
}

/** Where Excel keeps the rich values of a workbook, a picture in a cell among them. */
const RICH = {
	metadata: 'xl/metadata.xml',
	values: 'xl/richData/rdrichvalue.xml',
	structures: 'xl/richData/rdrichvaluestructure.xml',
	pictures: 'xl/richData/richValueRel.xml'
};
/** The kind of a cell's metadata that names a rich value, and the key of a rich value that names a picture. */
const RICH_VALUE = 'XLRICHVALUE';
const LOCAL_IMAGE = '_rvRel:LocalImageIdentifier';

/**
 * The pictures that are cells' values, by the number a cell names its value's
 * metadata with (`vm`). A cell reaches its picture in five steps: its
 * metadata names a rich value, the rich value is of a structure, one key of
 * which holds a place in the list of pictures, which names a relationship,
 * which is the file.
 */
function cellPictures(parts: Parts): Map<string, string> {
	const files = relationships(parts, RICH.pictures);
	const pictures: (string | undefined)[] = [];
	scan(parts, RICH.pictures, {
		open(name, attributes) {
			if (name === 'rel') pictures.push(files.get(attributes.id)?.path);
		}
	});
	if (pictures.length === 0) return new Map();

	/** For each structure, where among its keys the picture is; -1 for one that holds none. */
	const structures: number[] = [];
	let keys: string[] = [];
	scan(parts, RICH.structures, {
		open(name, attributes) {
			if (name === 's') keys = [];
			if (name === 'k') keys.push(attributes.n);
		},
		close(name) {
			if (name === 's') structures.push(keys.indexOf(LOCAL_IMAGE));
		}
	});

	/** The picture of each rich value; undefined for one that is something else. */
	const values: (string | undefined)[] = [];
	let value: { structure: number; held: string[] } | null = null;
	scan(parts, RICH.values, {
		open(name, attributes) {
			if (name === 'rv') value = { structure: Number(attributes.s), held: [] };
		},
		text(text, inside) {
			if (value && inside.at(-1) === 'v') value.held.push(text);
		},
		close(name) {
			if (name !== 'rv' || !value) return;
			const at = structures[value.structure] ?? -1;
			values.push(at < 0 ? undefined : pictures[Number(value.held[at])]);
			value = null;
		}
	});

	const types: string[] = [];
	/** The rich value each record of the rich value metadata names. */
	const records: number[] = [];
	const byNumber = new Map<string, string>();
	let block = 0;
	scan(parts, RICH.metadata, {
		open(name, attributes, inside) {
			if (name === 'metadataType') types.push(attributes.name);
			if (name === 'rvb') records.push(Number(attributes.i));
			if (inside.at(-1) === 'valueMetadata' && name === 'bk') block += 1;
			if (name !== 'rc' || inside.at(-2) !== 'valueMetadata') return;
			// `t` counts the kinds of metadata from 1, `v` the records of that kind from 0.
			if (types[Number(attributes.t) - 1] !== RICH_VALUE) return;
			const picture = values[records[Number(attributes.v)]];
			if (picture) byNumber.set(String(block), picture);
		}
	});
	return byNumber;
}

/** A cell's place from its name: `C5` is row 5 of column 2. */
function cellPlace(name: string): { row: number; column: number } | null {
	const found = /^([A-Z]+)(\d+)$/.exec(name);
	if (!found) return null;
	let column = 0;
	for (const letter of found[1]) column = column * 26 + (letter.charCodeAt(0) - 64);
	return { row: Number(found[2]), column: column - 1 };
}

/** The pictures that are the values of a sheet's cells. */
function inCells(parts: Parts, sheet: string, byNumber: Map<string, string>): PlacedPicture[] {
	const placed: PlacedPicture[] = [];
	scan(parts, sheet, {
		open(name, attributes) {
			const media = name === 'c' && attributes.vm ? byNumber.get(attributes.vm) : undefined;
			const place = media ? cellPlace(attributes.r ?? '') : null;
			if (media && place) placed.push({ ...place, media });
		}
	});
	return placed;
}

/**
 * The pictures of each sheet of a workbook, by the sheet's name. Throws for
 * bytes that are not a workbook.
 */
export function readPictures(workbook: Uint8Array): Map<string, PlacedPicture[]> {
	// The pictures themselves are not read, so they are not unpacked if they are there.
	const parts = unzipSync(workbook, { filter: (file) => !file.name.startsWith('xl/media/') });
	const sheets = relationships(parts, 'xl/workbook.xml');
	const byNumber = cellPictures(parts);

	const pictures = new Map<string, PlacedPicture[]>();
	scan(parts, 'xl/workbook.xml', {
		open(name, attributes) {
			const sheet = name === 'sheet' ? sheets.get(attributes.id) : undefined;
			if (!sheet) return;
			pictures.set(attributes.name, [
				...floating(parts, sheet.path),
				// A sheet is gone through cell by cell only when the workbook has such a picture.
				...(byNumber.size > 0 ? inCells(parts, sheet.path, byNumber) : [])
			]);
		}
	});
	return pictures;
}
