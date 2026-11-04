<script lang="ts">
	import FormattedText from '#lib/components/formatted/formatted-text.svelte';
	import { plainText } from '#lib/formatted-text.js';
	import { cn } from '#lib/utils.js';
	import { picture } from './styles.js';

	/**
	 * A passage as a pupil gets it: beside each of its questions, in a box that
	 * scrolls when the passage is long. Like the rest of the pupil view it is a
	 * picture of the runner, and draws nothing of a passage not written yet.
	 *
	 * The box has the 10px corners of a box in the pupil view, and its picture,
	 * well inside it, the ladder's smallest.
	 */
	let {
		title,
		body,
		imageUrl,
		class: className
	}: {
		title: string;
		/** The text pupils read, formatted. */
		body: string;
		/** Where the passage's picture is shown from; undefined when it has none. */
		imageUrl: string | undefined;
		/** Layout: how tall the box may be where it stands. */
		class?: string;
	} = $props();
</script>

{#if title.trim() || plainText(body) || imageUrl}
	<div
		class={cn(
			'flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-lg border bg-card px-4 py-3.5 text-lg leading-relaxed',
			className
		)}
	>
		{#if title.trim()}
			<span class="text-xl font-semibold wrap-break-word">{title}</span>
		{/if}
		{#if plainText(body)}
			<FormattedText html={body} />
		{/if}
		{#if imageUrl}
			<img src={imageUrl} alt="" class={cn(picture.large, 'self-start rounded-sm')} />
		{/if}
	</div>
{/if}
