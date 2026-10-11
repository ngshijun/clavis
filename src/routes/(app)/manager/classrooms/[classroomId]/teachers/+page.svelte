<script lang="ts">
	import ClassroomRoster from '#lib/components/classrooms/classroom-roster.svelte';
	import type { ClassroomTeacher } from '#lib/server/classrooms.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const row = (teacher: ClassroomTeacher) => ({
		id: teacher.id,
		name: teacher.name,
		detail: teacher.email
	});
</script>

<ClassroomRoster
	kind="teachers"
	classroom={data.classroom}
	members={data.teachers.map(row)}
	candidates={data.candidates.map(row)}
/>
