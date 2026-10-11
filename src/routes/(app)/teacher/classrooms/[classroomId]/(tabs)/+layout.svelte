<script lang="ts">
	import ClassroomTabs from '#lib/components/classrooms/classroom-tabs.svelte';
	import { classroomSections } from '#lib/navigation.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<ClassroomTabs
	classroom={data.classroom}
	sections={classroomSections('teacher', data.classroom.id)}
>
	{@render children()}
</ClassroomTabs>
