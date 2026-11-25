<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ClassroomTabs from '#lib/components/classrooms/classroom-tabs.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { classroomSections } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

	/**
	 * The classroom's pages, under its banner. A manager reads what its
	 * teachers read and keeps its two rosters; archived, it is only read. A
	 * student's finished practice sits outside this group: it is the only
	 * thing on its page.
	 */
	let { data, children }: LayoutProps = $props();
</script>

<ClassroomTabs
	classroom={data.classroom}
	sections={classroomSections('manager', data.classroom.id)}
>
	{#if data.classroom.archivedAt}
		<Alert.Root>
			<ArchiveIcon />
			<Alert.Description>{m.classroom_archived_note()}</Alert.Description>
		</Alert.Root>
	{/if}
	{@render children()}
</ClassroomTabs>
