<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	/**
	 * The picture of something that has a cover: a classroom, a subject. It is
	 * drawn wherever the thing is named (its card, its banner, its row in the
	 * sidebar), because a picture is the fastest way to tell two things apart
	 * whose names differ by a trailing "A" or "B".
	 */
	let {
		id,
		coverUrl,
		class: className,
		children
	}: {
		id: string;
		/** Public URL of the cover image; null when there is none. */
		coverUrl: string | null;
		class?: string;
		/** What stands on the tint of a thing with no cover: a letter of its name. */
		children?: Snippet;
	} = $props();

	/**
	 * Without a cover the thing gets a tint derived from its id, stable for
	 * that thing. Spread by the golden angle: siblings often have ids one
	 * character apart, which a plain modulo maps to neighbouring hues.
	 */
	const hue = $derived.by(() => {
		let hash = 0;
		for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
		return Math.floor((Math.abs(hash) * 137.508) % 360);
	});
</script>

{#if coverUrl}
	<img src={coverUrl} alt="" class={cn('object-cover', className)} />
{:else}
	<div
		aria-hidden="true"
		class={cn(
			'flex items-center justify-center bg-linear-135 from-[hsl(var(--hue)_65%_62%)] to-[hsl(calc(var(--hue)+40)_65%_48%)] font-extrabold text-white/90',
			className
		)}
		style:--hue={hue}
	>
		{@render children?.()}
	</div>
{/if}
