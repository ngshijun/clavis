<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { dragHandle } from 'svelte-dnd-action';
	import { cn } from '#lib/utils.js';

	/**
	 * What a row is dragged by. From the keyboard, Space or Enter picks the row
	 * up and puts it down, and the arrow keys move it.
	 */
	let { label, class: className }: { label: string; class?: string } = $props();

	/**
	 * Keeps the keyboard where it was when a row is put down. While a row is
	 * carried, the focus is on the row, and the drag library takes it away as
	 * the row is dropped, which would leave the next key at the top of the
	 * page. So when the row loses the focus to nothing, it goes to the handle.
	 */
	function keepFocus(handle: HTMLElement) {
		let row: HTMLElement | null = null;

		const dropped = (blur: FocusEvent) => {
			// Tab puts the row down too, and takes the focus where it was going.
			if (blur.relatedTarget) return row?.removeEventListener('blur', dropped);
			// Looked at a moment later: a row that moves in the list loses the focus and gets it back.
			setTimeout(() => {
				if (document.activeElement !== document.body) return;
				row?.removeEventListener('blur', dropped);
				if (handle.isConnected) handle.focus();
			});
		};
		const pickedUp = (event: KeyboardEvent) => {
			if (event.key !== ' ' && event.key !== 'Enter') return;
			// The library marks each row of a zone as a list item; the handle is somewhere inside its own.
			row = handle.closest<HTMLElement>('[role="listitem"]');
			row?.addEventListener('blur', dropped);
		};

		handle.addEventListener('keydown', pickedUp);
		return () => {
			handle.removeEventListener('keydown', pickedUp);
			row?.removeEventListener('blur', dropped);
		};
	}
</script>

<span
	use:dragHandle
	{@attach keepFocus}
	aria-label={label}
	title={label}
	class={cn(
		'flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
		className
	)}
>
	<GripVerticalIcon class="size-4" />
</span>
