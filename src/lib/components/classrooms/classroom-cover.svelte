<script lang="ts">
	import type { Classroom } from '#lib/server/classrooms.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A classroom's picture, wherever the classroom is named: its card, its
	 * banner, its row in the sidebar. The cover is the point: two classrooms can
	 * differ only by a trailing "A" or "B", and a picture is the fastest way to
	 * tell them apart.
	 */
	let {
		classroom,
		class: className
	}: { classroom: Pick<Classroom, 'id' | 'coverUrl'>; class?: string } = $props();

	/**
	 * Without a cover the classroom gets a tint derived from its id, stable per
	 * classroom. Spread by the golden angle: sibling classrooms often have ids
	 * one character apart, which a plain modulo maps to neighbouring hues.
	 */
	const hue = $derived.by(() => {
		let hash = 0;
		for (const char of classroom.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
		return Math.floor((Math.abs(hash) * 137.508) % 360);
	});
</script>

{#if classroom.coverUrl}
	<img src={classroom.coverUrl} alt="" class={cn('object-cover', className)} />
{:else}
	<div
		class={cn(
			'bg-linear-135 from-[hsl(var(--hue)_65%_62%)] to-[hsl(calc(var(--hue)+40)_65%_48%)]',
			className
		)}
		style:--hue={hue}
	></div>
{/if}
