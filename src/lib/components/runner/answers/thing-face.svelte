<script lang="ts">
	import { getRunner } from '../context.js';

	/** What a choice or a thing to move shows a pupil: its picture, its words, or both. */
	let { thing }: { thing: { text: string; image_path?: string | null } } = $props();

	const runner = getRunner();
	const picture = $derived(runner.imageUrl(thing.image_path));
</script>

<span class="flex min-w-0 flex-col items-start gap-1.5">
	{#if picture}
		<img src={picture} alt="" class="max-h-24 max-w-full rounded-sm" />
	{/if}
	{#if thing.text}
		<span class="wrap-break-word">{thing.text}</span>
	{/if}
</span>
