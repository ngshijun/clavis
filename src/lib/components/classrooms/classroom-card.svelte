<script lang="ts">
	import type { Snippet } from 'svelte';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ClassroomCover from '#lib/components/classrooms/classroom-cover.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
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

<!-- `gap-0 py-0` so the cover sits flush with the card's top and side borders. -->
<Card.Root
	class="relative gap-0 overflow-hidden py-0 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
>
	<ClassroomCover {classroom} class="aspect-video w-full" />

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
