<script lang="ts">
	import { coverGrid } from '#lib/components/app/cover-card.svelte';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/** A student's classrooms. A card says what the classroom is and nothing of what is done in it. */
	let { data }: PageProps = $props();
</script>

{#if data.classrooms.length === 0}
	<ClassroomEmpty description={m.picker_empty_student()} />
{:else}
	<div class={coverGrid}>
		{#each data.classrooms as classroom (classroom.id)}
			<ClassroomCard {classroom} href={resolvePath(classroomPath('student', classroom.id))} />
		{/each}
	</div>
{/if}
