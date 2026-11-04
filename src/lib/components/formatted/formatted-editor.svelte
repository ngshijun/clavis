<script lang="ts">
	import { untrack, type Component, type Snippet } from 'svelte';
	import { Editor, type ChainedCommands } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extensions';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Toggle } from '#lib/components/ui/toggle/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { FORMATTED_EXTENSIONS } from './extensions.js';

	/**
	 * A formatted text field: the text under a format bar, the text styles
	 * then the lists. `value` is the text as HTML, or empty when nothing is
	 * written. The editor writes it as it is typed in; a value set from
	 * outside, such as a question put back as it was saved, replaces the text.
	 * A field with its own control, such as the picture of a question, puts it
	 * in the `foot`.
	 */
	let {
		id,
		value = $bindable(''),
		label,
		placeholder = '',
		invalid = false,
		textClass = 'min-h-20',
		class: className,
		foot
	}: {
		/** The id of the text, which a label names it by. */
		id?: string;
		value?: string;
		/** The text's accessible name. */
		label: string;
		placeholder?: string;
		invalid?: boolean;
		/** On the text: its least height. */
		textClass?: string;
		class?: string;
		/** A control in the field's foot, under the text. */
		foot?: Snippet;
	} = $props();

	let editor = $state.raw<Editor | null>(null);
	/** The value the editor last wrote, which it need not be given back. */
	let written: string | undefined;
	// Bumped on every change to the text or the selection, so the bar follows the caret.
	let revision = $state(0);

	type Style = {
		name: string;
		label: () => string;
		icon: Component;
		apply: (chain: ChainedCommands) => ChainedCommands;
	};
	// The text styles, then the lists, a divider between them.
	const STYLE_GROUPS: Style[][] = [
		[
			{ name: 'bold', label: m.format_bold, icon: BoldIcon, apply: (c) => c.toggleBold() },
			{ name: 'italic', label: m.format_italic, icon: ItalicIcon, apply: (c) => c.toggleItalic() },
			{
				name: 'underline',
				label: m.format_underline,
				icon: UnderlineIcon,
				apply: (c) => c.toggleUnderline()
			},
			{
				name: 'strike',
				label: m.format_strikethrough,
				icon: StrikethroughIcon,
				apply: (c) => c.toggleStrike()
			}
		],
		[
			{
				name: 'bulletList',
				label: m.format_bulleted_list,
				icon: ListIcon,
				apply: (c) => c.toggleBulletList()
			},
			{
				name: 'orderedList',
				label: m.format_numbered_list,
				icon: ListOrderedIcon,
				apply: (c) => c.toggleOrderedList()
			}
		]
	];

	function isActive(style: Style): boolean {
		void revision;
		return editor?.isActive(style.name) ?? false;
	}

	function apply(style: Style) {
		if (editor) style.apply(editor.chain().focus()).run();
	}

	// The text's own attributes follow the props while the editor is open.
	$effect(() => {
		const attributes = {
			...(id ? { id } : {}),
			'aria-label': label,
			'aria-multiline': 'true',
			...(invalid ? { 'aria-invalid': 'true' } : {}),
			role: 'textbox',
			class: cn(textClass, 'px-3 py-2 outline-none')
		};
		editor?.setOptions({ editorProps: { attributes } });
	});

	$effect(() => {
		const given = value;
		if (!editor || given === written) return;
		written = given;
		editor.commands.setContent(given, { emitUpdate: false });
	});

	function mount(element: HTMLElement) {
		const instance = new Editor({
			element,
			extensions: [...FORMATTED_EXTENSIONS, Placeholder.configure({ placeholder })],
			content: untrack(() => (written = value)),
			onTransaction: ({ transaction }) => {
				if (transaction.docChanged || transaction.selectionSet || transaction.storedMarksSet) {
					revision++;
				}
			},
			onUpdate: ({ editor }) => {
				written = editor.isEmpty ? '' : editor.getHTML();
				value = written;
			}
		});
		editor = instance;
		return () => {
			instance.destroy();
			editor = null;
		};
	}
</script>

<div
	data-invalid={invalid ? true : undefined}
	class={cn(
		'flex flex-col rounded-2xl border border-transparent bg-input/50 transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 dark:data-invalid:ring-destructive/40',
		className
	)}
>
	<!-- Pressing a button keeps the caret in the text, as in a Mac app's format bar; the keyboard
	     still reaches every control. -->
	<div
		role="toolbar"
		aria-label={m.format_bar()}
		tabindex="-1"
		class="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
		onmousedown={(event) => event.preventDefault()}
	>
		{#each STYLE_GROUPS as group, index (index)}
			{#if index > 0}
				<Separator orientation="vertical" class="mx-1 data-[orientation=vertical]:h-5" />
			{/if}
			{#each group as style (style.name)}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Toggle
								{...props}
								size="sm"
								class="px-0 aria-pressed:bg-primary/15 aria-pressed:text-primary"
								aria-label={style.label()}
								pressed={isActive(style)}
								onPressedChange={() => apply(style)}><style.icon /></Toggle
							>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{style.label()}</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		{/each}
	</div>
	<div class="formatted-text text-base" {@attach mount}></div>
	{#if foot}
		<div class="px-2 pb-2">{@render foot()}</div>
	{/if}
</div>
