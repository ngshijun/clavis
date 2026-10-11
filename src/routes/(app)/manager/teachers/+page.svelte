<script lang="ts">
	import PeopleDirectory from '#lib/components/people/people-directory.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const people = $derived(
		data.teachers.map((teacher) => ({
			id: teacher.id,
			name: teacher.name,
			detail: teacher.email,
			classroomCount: teacher.classroomCount
		}))
	);
</script>

<PeopleDirectory role="teacher" {people} />
