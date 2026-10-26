<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { bandsOf, type Point } from '#lib/items/dashboard.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import { cn } from '#lib/utils.js';
	import { BAND_COLOURS, percent } from './percent.js';

	/**
	 * How the students stand on each learning point, the weakest first, one
	 * line each and two columns wide, so that many fit. A learning point
	 * belongs to the subject of the classrooms it was answered in; with
	 * classrooms of several subjects one subject is shown at a time.
	 */
	let { points, classrooms }: { points: Point[]; classrooms: Classroom[] } = $props();

	/** As many as are shown before the rest are asked for. */
	const FEW = 10;

	const subjectOf = $derived(new Map(classrooms.map((each) => [each.id, each.subjectId])));
	const subjects = $derived(
		[...new Map(classrooms.map((each) => [each.subjectId, each])).values()].map((each) => ({
			id: each.subjectId,
			label: `${each.gradeLevelName} · ${each.subjectName}`
		}))
	);

	let picked = $state<string>();
	const subject = $derived(subjects.find((each) => each.id === picked) ?? subjects[0]);
	const shown = $derived(
		subjects.length > 1
			? points.filter((point) => point.classroomIds.some((id) => subjectOf.get(id) === subject?.id))
			: points
	);
	const bands = $derived(bandsOf(shown));

	let all = $state(false);
	const listed = $derived(all ? shown : shown.slice(0, FEW));

	const key = $derived([
		{ band: 'needs_work', label: m.dashboard_points_needs_work({ count: bands.needs_work }) },
		{
			band: 'getting_there',
			label: m.dashboard_points_getting_there({ count: bands.getting_there })
		},
		{ band: 'secure', label: m.dashboard_points_secure_band({ count: bands.secure }) }
	] as const);
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_points_title()}</Card.Title>
		<Card.Description>{m.dashboard_points_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="@container flex flex-col gap-3">
		{#if subjects.length > 1 && subject}
			<Select.Root
				type="single"
				bind:value={() => subject.id, (id) => ((picked = id), (all = false))}
			>
				<Select.Trigger
					size="sm"
					class="max-w-full self-start"
					aria-label={m.dashboard_subject_label()}
				>
					{subject.label}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						{#each subjects as each (each.id)}
							<Select.Item value={each.id} label={each.label} />
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		{/if}
		{#if shown.length === 0}
			<p class="text-muted-foreground">{m.dashboard_points_empty()}</p>
		{:else}
			<p class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{#each key as { band, label } (band)}
					<span class="inline-flex items-center gap-1.5">
						<span class={cn('h-2.5 w-3.5 rounded-full', BAND_COLOURS[band])} aria-hidden="true"
						></span>
						{label}
					</span>
				{/each}
			</p>
			<ul class="grid gap-x-6 @lg:grid-cols-2">
				{#each listed as point (point.id)}
					<li
						class="grid h-9 grid-cols-[minmax(0,1fr)_4.5rem_2.5rem] items-center gap-2.5 border-t first:border-t-0 @lg:nth-[2]:border-t-0"
					>
						<span class="truncate font-medium first-letter:uppercase">
							{point.name}
							<span class="sr-only">· {m.dashboard_points_answered({ count: point.students })}</span
							>
						</span>
						<span class="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
							<span
								class={cn('block h-full rounded-full', BAND_COLOURS[point.band])}
								style:width={percent(point.score)}
							></span>
						</span>
						<span class="text-end font-semibold tabular-nums">{percent(point.score)}</span>
					</li>
				{/each}
			</ul>
			{#if shown.length > FEW}
				<Button variant="link" size="sm" class="self-start px-0" onclick={() => (all = !all)}>
					{all
						? m.dashboard_points_show_fewer()
						: m.dashboard_points_show_all({ count: shown.length })}
				</Button>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
