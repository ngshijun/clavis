<script lang="ts">
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import { coverGrid } from '#lib/components/app/cover-card.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.classrooms.length === 0}
	<ClassroomEmpty description={m.picker_empty_staff()} />
{:else}
	<StatStrip
		stats={[
			{ label: m.nav_classrooms(), value: data.classrooms.length },
			{ label: m.section_students(), value: data.studentCount }
		]}
	/>

	<section class="mt-4 flex flex-col gap-4">
		<h2 class="text-lg font-semibold">{m.nav_classrooms()}</h2>
		<div class={coverGrid}>
			{#each data.classrooms as classroom (classroom.id)}
				<ClassroomCard {classroom} href={resolvePath(classroomPath('teacher', classroom.id))} />
			{/each}
		</div>
	</section>
{/if}
