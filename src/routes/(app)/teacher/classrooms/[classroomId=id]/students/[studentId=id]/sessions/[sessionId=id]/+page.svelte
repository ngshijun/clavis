<script lang="ts">
	import Session from '#lib/components/staff/session.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Session {data} />
