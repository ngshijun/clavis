<script lang="ts">
	import { Editor } from '@tiptap/core';
	import { cn } from '#lib/utils.js';
	import { FORMATTED_EXTENSIONS } from './extensions.js';

	/** Formatted text as a reader gets it: formatted as written, and not editable. */
	let { html, class: className }: { html: string; class?: string } = $props();

	function render(content: string) {
		return (element: HTMLElement) => {
			const editor = new Editor({
				element,
				extensions: FORMATTED_EXTENSIONS,
				content,
				editable: false,
				// Read, not typed in: it is no text box to a screen reader.
				editorProps: { attributes: { role: 'presentation' } }
			});
			return () => editor.destroy();
		};
	}
</script>

<!-- A new text is a new editor: the attachment is made again when `html` changes. -->
<div class={cn('formatted-text wrap-break-word', className)} {@attach render(html)}></div>
