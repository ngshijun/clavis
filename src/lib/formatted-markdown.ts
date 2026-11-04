import { Marked, type Token, type TokenizerExtension } from 'marked';

/**
 * A spreadsheet cell written with Markdown's marks, as formatted text: what
 * the format bar would have made of it, and nothing it could not make.
 *
 * - `**bold**`, `*italic*`, `++underline++` and `~~strikethrough~~`; Markdown
 *   has no underline, so `++` is borrowed from markdown-it's convention.
 * - A line that starts with `- ` (or `* `, `+ `) is a bulleted list item, one
 *   that starts with `1. ` (or `1) `) a numbered one; lines in a row make one list.
 * - Every other line is a paragraph, an empty line an empty paragraph, as the
 *   editor keeps them.
 * - Anything else Markdown has (headings, links, code, HTML) is kept as the
 *   words that were typed. `\` before a mark keeps the mark as it is.
 */

const underline: TokenizerExtension = {
	name: 'underline',
	level: 'inline',
	start: (src) => src.indexOf('++'),
	tokenizer(src) {
		const match = /^\+\+(?=\S)([\s\S]*?\S)\+\+/.exec(src);
		if (!match) return undefined;
		return {
			type: 'underline',
			raw: match[0],
			tokens: this.lexer.inlineTokens(match[1])
		};
	}
};

const markdown = new Marked({ gfm: true, extensions: [underline] });

const escaped = (text: string) =>
	text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const MARKS: Record<string, string> = { strong: 'strong', em: 'em', underline: 'u', del: 's' };

function inline(tokens: Token[]): string {
	return tokens
		.map((token) => {
			const mark = MARKS[token.type];
			if (mark && 'tokens' in token && token.tokens) {
				return `<${mark}>${inline(token.tokens)}</${mark}>`;
			}
			if (token.type === 'text' && 'tokens' in token && token.tokens) return inline(token.tokens);
			if (token.type === 'text' || token.type === 'escape') return escaped(token.text);
			// A link, code, HTML or anything else the format bar has no choice for: the words as typed.
			return escaped(token.raw);
		})
		.join('');
}

const line = (text: string) => inline(markdown.Lexer.lexInline(text, markdown.defaults));

const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;

interface List {
	tag: 'ul' | 'ol';
	start: number;
	items: string[];
}

export function formattedFromMarkdown(text: string): string {
	if (!text.trim()) return '';
	const blocks: string[] = [];
	let list = null as List | null;
	const close = () => {
		if (!list) return;
		const start = list.tag === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
		blocks.push(`<${list.tag}${start}>${list.items.join('')}</${list.tag}>`);
		list = null;
	};

	for (const raw of text.trim().split(/\r?\n/)) {
		const written = raw.replace(/\s+/g, ' ').trim();
		const bullet = BULLET.exec(written);
		const numbered = bullet ? null : NUMBERED.exec(written);
		const tag = bullet ? 'ul' : numbered ? 'ol' : null;
		if (!tag) {
			close();
			blocks.push(`<p>${line(written)}</p>`);
			continue;
		}
		if (list?.tag !== tag) {
			close();
			list = { tag, start: numbered ? Number(numbered[1]) : 1, items: [] };
		}
		list.items.push(`<li><p>${line((bullet ?? numbered)!.at(-1)!)}</p></li>`);
	}
	close();
	return blocks.join('');
}
