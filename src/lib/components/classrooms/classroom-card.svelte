<script lang="ts">
	import type { Snippet } from 'svelte';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import UsersIcon from '@lucide/svelte/icons/users';
	import Cover from '#lib/components/app/cover.svelte';
	import CoverCard from '#lib/components/app/cover-card.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	/**
	 * One classroom as a card, shared by the manager's list, the teacher's
	 * dashboard and the student's classrooms so a cover uploaded once is seen
	 * everywhere.
	 */
	let {
		classroom,
		href,
		actions,
		children
	}: {
		classroom: Classroom;
		/** Where the card leads; the whole card is the link. */
		href: string;
		/** Controls laid over the cover's corner. */
		actions?: Snippet;
		/** What the page adds under the classroom's own lines. */
		children?: Snippet;
	} = $props();
</script>

<CoverCard {href} name={classroom.name} {actions}>
	{#snippet cover()}
		<Cover id={classroom.id} coverUrl={classroom.coverUrl} class="aspect-video w-full" />
	{/snippet}

	<p class="-mt-1.5 text-muted-foreground">
		{classroom.gradeLevelName} · {classroom.subjectName}
	</p>
	<!-- Who teaches it tells two classrooms of one grade and subject apart. -->
	{#if classroom.teachers.length > 0 || classroom.counts}
		<div class="flex flex-col gap-1 text-muted-foreground">
			<span class="flex items-start gap-1">
				<GraduationCapIcon class="mt-0.5 size-4 shrink-0" />
				<span class="min-w-0 wrap-break-word">
					{classroom.teachers.join(', ') || m.classroom_no_teacher()}
				</span>
			</span>
			{#if classroom.counts}
				<span class="flex items-center gap-1">
					<UsersIcon class="size-4 shrink-0" />
					{m.count_students({ count: classroom.counts.students })}
				</span>
			{/if}
		</div>
	{/if}
	{@render children?.()}
</CoverCard>
