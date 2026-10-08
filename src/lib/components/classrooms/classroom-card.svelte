<script lang="ts">
	import type { Snippet } from 'svelte';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import UsersIcon from '@lucide/svelte/icons/users';
	import Cover from '#lib/components/app/cover.svelte';
	import CoverCard from '#lib/components/app/cover-card.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/**
	 * One classroom as a card, shared by the manager's grid, the teacher's
	 * dashboard and the student's picker so a cover uploaded once is seen
	 * everywhere.
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
</script>

<CoverCard {href} name={classroom.name} {actions}>
	{#snippet cover()}
		<Cover id={classroom.id} coverUrl={classroom.coverUrl} class="aspect-video w-full" />
	{/snippet}

	<p class="-mt-1.5 text-muted-foreground">
		{classroom.gradeLevelName} · {classroom.subjectName}
	</p>
	{#if classroom.counts}
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-1 whitespace-nowrap text-muted-foreground"
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
</CoverCard>
