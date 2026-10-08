import { writeTemplate } from '#lib/server/workbook.js';
import type { RequestHandler } from './$types';

/**
 * The empty workbook an import starts from. It is the same for every stage,
 * and is written from the sheet definitions the import reads by. Like the
 * pages around it, only an admin reaches it: the role guard goes by the route.
 */
export const GET: RequestHandler = async () => {
	const workbook = await writeTemplate();
	return new Response(new Uint8Array(workbook), {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': 'attachment; filename="clavis-practice-import.xlsx"',
			// It changes only with a release, but a release must not be met by yesterday's sheets.
			'cache-control': 'no-store'
		}
	});
};
