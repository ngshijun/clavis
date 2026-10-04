<script lang="ts">
	import type { Snippet } from 'svelte';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/**
	 * One classroom as a card, shared by the manager's grid and the teacher's
	 * and student's pickers so a cover uploaded once is seen everywhere.
	 *
	 * The cover is the point: two classes can differ only by a trailing "A" or
	 * "B", and a picture is the fastest way to tell them apart.
	 */
	let {
		classroom,
		href,
		actions
	}: {
		classroom: Classroom;
		/** Where the card leads; the whole card is the link. */
		href: string;
		/** Controls laid over the cover's corner. */
		actions?: Snippet;
	} = $props();

	/**
	 * Without a cover the card gets a tint derived from the classroom id, stable
	 * per classroom. Spread by the golden angle: sibling classrooms often have
	 * ids one character apart, which a plain modulo maps to neighbouring hues.
	 */
	const hue = $derived.by(() => {
		let hash = 0;
		for (const char of classroom.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
		return Math.floor((Math.abs(hash) * 137.508) % 360);
	});
</script>

<!-- `gap-0 py-0` so the cover sits flush with the card's top and side borders. -->
<Card.Root
	class="relative gap-0 overflow-hidden py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
>
	{#if classroom.coverUrl}
		<img src={classroom.coverUrl} alt="" class="aspect-video w-full object-cover" />
	{:else}
		<div
			class="aspect-video w-full bg-linear-135 from-[hsl(var(--hue)_65%_62%)] to-[hsl(calc(var(--hue)+40)_65%_48%)]"
			style:--hue={hue}
		></div>
	{/if}

	<Card.Content class="flex flex-col gap-3 py-4">
		<div class="flex items-start gap-2">
			<SchoolIcon class="mt-0.5 size-5 shrink-0 text-primary" />
			<!-- The link's pseudo-element covers the card, so the whole card is one target. -->
			<a
				{href}
				class="min-w-0 leading-tight font-semibold wrap-break-word outline-none after:absolute after:inset-0"
			>
				{classroom.name}
			</a>
		</div>
		<p class="text-sm text-muted-foreground">
			{classroom.gradeLevelName} · {classroom.subjectName}
		</p>
		{#if classroom.counts}
			<div
				class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm whitespace-nowrap text-muted-foreground"
			>
				<span class="flex items-center gap-1">
					<UsersIcon class="size-4" />
					{m.count_students({ count: classroom.counts.students })}
				</span>
				<span class="flex items-center gap-1">
					<GraduationCapIcon class="size-4" />
					{m.count_teachers({ count: classroom.counts.teachers })}
				</span>
			</div>
		{/if}
	</Card.Content>

	{#if actions}
		<div class="absolute top-2 right-2 flex gap-1">
			{@render actions()}
		</div>
	{/if}
</Card.Root>
