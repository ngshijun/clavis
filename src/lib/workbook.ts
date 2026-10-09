import { unzipSync, zipSync } from 'fflate';
import { fingerprint, preparePicture } from '#lib/image.js';

/**
 * A workbook as the page takes it apart before an import. An Excel file is a
 * zip, and its pictures can make it far larger than a request may be, so the
 * page takes them out: the workbook that is left is sent to be read, and each
 * picture is made ready here and uploaded on its own when the import is made.
 */

/** The folder of a workbook's zip that holds its pictures. */
const MEDIA = 'xl/media/';

/** Bytes in memory of their own, as fflate hands them out and as a file is made from. */
type Bytes = Uint8Array<ArrayBuffer>;

/**
 * A workbook's bytes as the workbook without its pictures and the pictures by
 * their name in the file. Everything that says where a picture sits stays in
 * the workbook; only the pictures' own bytes leave it. Throws for bytes that
 * are not a zip.
 */
export function splitWorkbook(bytes: Uint8Array): { workbook: Bytes; media: Map<string, Bytes> } {
	const media = new Map<string, Bytes>();
	const rest: Record<string, Bytes> = {};
	for (const [name, content] of Object.entries(unzipSync(bytes) as Record<string, Bytes>)) {
		if (name.startsWith(MEDIA)) media.set(name, content);
		else rest[name] = content;
	}
	return { workbook: zipSync(rest) as Bytes, media };
}

/** What a browser calls each kind of picture a workbook may hold, by the end of its name. */
const TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	bmp: 'image/bmp'
};

/** A picture of a workbook made ready to upload, and what it is told from another by. */
export interface ReadyPicture {
	file: File;
	mark: string;
}

/**
 * The pictures of a workbook that can be used, made ready to upload, by their
 * name in the file. One the browser cannot read as a picture, such as a
 * drawing Excel keeps as EMF, is not among them.
 */
export async function readyPictures(media: Map<string, Bytes>): Promise<Map<string, ReadyPicture>> {
	const ready = new Map<string, ReadyPicture>();
	for (const [name, bytes] of media) {
		const type = TYPES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] ?? '';
		const file = await preparePicture(new File([bytes], name.slice(MEDIA.length), { type }));
		if (file) ready.set(name, { file, mark: await fingerprint(file) });
	}
	return ready;
}
