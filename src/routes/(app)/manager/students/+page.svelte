<script lang="ts">
	import PeopleDirectory from '#lib/components/people/people-directory.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const people = $derived(
		data.students.map((student) => ({
			id: student.id,
			name: student.name,
			detail: [student.username, student.gradeLevelName].filter(Boolean).join(' · ') || null,
			classroomCount: student.classroomCount
		}))
	);
</script>

<PeopleDirectory role="student" {people} gradeLevels={data.gradeLevels} />
