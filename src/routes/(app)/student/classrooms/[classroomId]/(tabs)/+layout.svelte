<script lang="ts">
	import ClassroomTabs from '#lib/components/classrooms/classroom-tabs.svelte';
	import { classroomSections } from '#lib/navigation.js';
	import type { LayoutProps } from './$types';

	/**
	 * The classroom's pages, under its banner. A stage being practised sits
	 * outside this group: a run is the only thing on its page.
	 */
	let { data, children }: LayoutProps = $props();
</script>

<ClassroomTabs
	classroom={data.classroom}
	sections={classroomSections('student', data.classroom.id)}
>
	{@render children()}
</ClassroomTabs>
