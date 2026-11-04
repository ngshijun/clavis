import StarterKit from '@tiptap/starter-kit';

/**
 * What formatted text may hold, the same whether it is written or read:
 * paragraphs, bold, italic, underline, strikethrough and lists, the format
 * bar's choices and nothing a typed shortcut could add beyond them. It is
 * stored as the HTML these produce and read back through them, so anything
 * else in the stored text is dropped rather than shown.
 */
export const FORMATTED_EXTENSIONS = [
	StarterKit.configure({
		heading: false,
		blockquote: false,
		code: false,
		codeBlock: false,
		horizontalRule: false,
		link: false,
		// An empty paragraph kept after a list would be stored with the text; Enter twice leaves a list.
		trailingNode: false
	})
];
