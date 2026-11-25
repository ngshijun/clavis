<script lang="ts">
	import Student from '#lib/components/staff/student.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Student role="manager" {data} />
