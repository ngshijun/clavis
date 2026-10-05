<script lang="ts">
	import { resolve } from '$app/paths';
	import StatCard from '#lib/components/app/stat-card.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="flex flex-col gap-8">
	{#if data.classrooms.length === 0}
		<ClassroomEmpty description={m.picker_empty_staff()} />
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard label={m.nav_classrooms()} value={data.classrooms.length} />
			<StatCard label={m.section_students()} value={data.studentCount} />
		</div>

		<section class="flex flex-col gap-4">
			<h2 class="text-lg font-semibold">{m.teacher_dashboard_classrooms()}</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.classrooms as classroom (classroom.id)}
					<ClassroomCard {classroom} href={resolve(classroomPath('teacher', classroom.id))} />
				{/each}
			</div>
		</section>
	{/if}
</div>
