<script lang="ts">
	import { resolve } from '$app/paths';
	import ClassroomCard from '#lib/components/classrooms/classroom-card.svelte';
	import ClassroomEmpty from '#lib/components/classrooms/classroom-empty.svelte';
	import { classroomPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.classrooms.length === 0}
	<ClassroomEmpty description={m.picker_empty_student()} />
{:else}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.classrooms as classroom (classroom.id)}
			<ClassroomCard {classroom} href={resolve(classroomPath('student', classroom.id))} />
		{/each}
	</div>
{/if}
