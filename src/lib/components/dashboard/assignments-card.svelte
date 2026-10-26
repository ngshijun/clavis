<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import type { Progress } from '#lib/items/dashboard.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';

	/**
	 * Where everyone given an assignment still in progress stands on it: one
	 * bar of the four, then each with its count. Late is done, after its due
	 * date; overdue is not done, after it.
	 */
	let { progress }: { progress: Progress } = $props();

	const parts = $derived([
		{ label: m.assignment_done(), count: progress.done, colour: 'bg-success' },
		{ label: m.assignment_late(), count: progress.late, colour: 'bg-warning' },
		{ label: m.assignment_to_do(), count: progress.toDo, colour: 'bg-border-strong' },
		{ label: m.dashboard_overdue_label(), count: progress.overdue, colour: 'bg-destructive' }
	]);
	const given = $derived(parts.reduce((sum, part) => sum + part.count, 0));
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_assignments_title()}</Card.Title>
		<Card.Description>{m.dashboard_assignments_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if given === 0}
			<p class="text-muted-foreground">{m.dashboard_assignments_empty()}</p>
		{:else}
			<span
				role="img"
				aria-label={m.dashboard_assignments_bar(progress)}
				class="flex h-2.5 gap-0.5"
			>
				{#each parts as part (part.label)}
					{#if part.count > 0}
						<span class={cn('rounded-full', part.colour)} style:flex-grow={part.count}></span>
					{/if}
				{/each}
			</span>
			<ul class="flex flex-col gap-1.5">
				{#each parts as part (part.label)}
					<li class="flex items-center gap-2">
						<span class={cn('h-2.5 w-3.5 rounded-full', part.colour)} aria-hidden="true"></span>
						<span class="flex-1">{part.label}</span>
						<span class="font-semibold tabular-nums">{part.count}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
