<script lang="ts">
	import Day from '#lib/components/app/day.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * When work that is still to do is due. Once that moment has passed it
	 * says so, in words as well as in colour: the work can still be done,
	 * and is then late.
	 */
	let { dueAt }: { dueAt: string } = $props();

	const overdue = $derived(Date.parse(dueAt) < Date.now());
</script>

<Badge variant={overdue ? 'destructive' : 'secondary'}>
	<Day
		at={dueAt}
		say={(date) => (overdue ? m.assignment_overdue({ date }) : m.assignment_due({ date }))}
	/>
</Badge>
