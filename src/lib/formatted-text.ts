/**
 * Formatted text: a question, a tip, a passage's body. It is stored as the
 * HTML the format bar's editor writes (`components/formatted/extensions.ts`
 * says what it may hold) and always read back through that editor, so
 * nothing outside that set is ever shown. These helpers only cut and join
 * strings, so the server and the page share them.
 */

const ENTITIES: Record<string, string> = {
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&nbsp;': ' ',
	'&amp;': '&'
};

/**
 * What formatted text says, as plain text: a line for each paragraph and
 * list item, and nothing of how it is formatted. A list row, a search, a
 * screen reader's label and the length a person is held to all go by it.
 */
export function plainText(html: string): string {
	return html
		.replace(/<br\s*\/?>|<\/(p|li)>/g, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&(lt|gt|quot|#39|nbsp|amp);/g, (entity) => ENTITIES[entity])
		.replace(/\n{2,}/g, '\n')
		.trim();
}

const escaped = (text: string) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Plain text, such as a spreadsheet cell, as formatted text: each line a
 * paragraph, its spaces as the editor keeps them. Nothing written is empty.
 */
export function formattedFromPlain(text: string): string {
	if (!text.trim()) return '';
	return text
		.trim()
		.split(/\r?\n/)
		.map((line) => `<p>${escaped(line.replace(/\s+/g, ' ').trim())}</p>`)
		.join('');
}
