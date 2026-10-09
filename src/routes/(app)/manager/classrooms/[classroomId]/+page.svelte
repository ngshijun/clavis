<script lang="ts">
	import ClassroomRoster from '#lib/components/classrooms/classroom-roster.svelte';
	import type { ClassroomStudent } from '#lib/server/classrooms.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const row = (student: ClassroomStudent) => ({
		id: student.id,
		name: student.name,
		detail: [student.username, student.gradeLevelName].filter(Boolean).join(' · ') || null
	});
</script>

<ClassroomRoster
	kind="students"
	classroom={data.classroom}
	members={data.students.map(row)}
	candidates={data.candidates.map(row)}
/>
