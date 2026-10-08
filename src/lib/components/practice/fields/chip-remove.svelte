<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import IconButton from '#lib/components/app/icon-button.svelte';

	/** The button at the end of a chip that takes the chip away. */
	let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<IconButton
	variant="ghost"
	size="icon-xs"
	data-remove
	{label}
	class="shrink-0 hover:bg-foreground/10"
	{onclick}
>
	<XIcon />
</IconButton>
