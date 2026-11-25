<script lang="ts">
	import Cover from '#lib/components/app/cover.svelte';
	import Star from '#lib/components/runner/star.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/**
	 * One of a student's classrooms on their home, as a tile in its cover's
	 * colours: its name, and what they have earned there. The whole tile is
	 * the way into the classroom.
	 *
	 * Which week it is depends on where they are, so the week's stars are
	 * undefined until the page is in their browser.
	 */
	let {
		classroom,
		href,
		stars,
		week,
		done
	}: {
		classroom: Classroom;
		href: string;
		/** The stars they hold there. */
		stars: number;
		/** Those that are new this week. */
		week: number | undefined;
		/** How many practices they have finished there. */
		done: number;
	} = $props();
</script>

{#snippet star()}
	<Star earned class="size-4" />
{/snippet}

<a
	{href}
	class="relative isolate flex min-h-36 overflow-hidden rounded-3xl text-white shadow-md transition-shadow outline-none hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px"
>
	<Cover id={classroom.id} coverUrl={classroom.coverUrl} class="absolute inset-0 -z-10 size-full" />
	<!-- A cover can be any picture, so the words sit on a scrim rather than on the picture. -->
	<span
		class="flex flex-1 flex-col justify-between gap-3 bg-linear-to-t from-black/60 to-black/15 p-4"
	>
		<span class="text-base leading-tight font-bold wrap-break-word">{classroom.name}</span>
		<span class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
			<span>{m.home_total_stars()}</span>
			<span class="flex items-center justify-end gap-1 font-semibold tabular-nums">
				{stars}
				{@render star()}
			</span>
			<span>{m.home_this_week()}</span>
			<span class="flex items-center justify-end gap-1 font-semibold tabular-nums">
				{week === undefined ? '–' : `+${week}`}
				{@render star()}
			</span>
			<span>{m.home_practices_done()}</span>
			<span class="text-end font-semibold tabular-nums">{done}</span>
		</span>
	</span>
</a>
