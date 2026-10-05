<script lang="ts">
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { dragHandle } from 'svelte-dnd-action';
	import { cn } from '#lib/utils.js';

	/**
	 * What a row is dragged by. From the keyboard, Space or Enter picks the row
	 * up and puts it down, and the arrow keys move it.
	 */
	let { label, class: className }: { label: string; class?: string } = $props();
</script>

<span
	use:dragHandle
	aria-label={label}
	title={label}
	class={cn(
		'flex h-8 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
		className
	)}
>
	<GripVerticalIcon class="size-4" />
</span>
