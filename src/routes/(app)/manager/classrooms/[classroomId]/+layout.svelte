<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ClassroomTabs from '#lib/components/classrooms/classroom-tabs.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { classroomSections } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { LayoutProps } from './$types';

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
