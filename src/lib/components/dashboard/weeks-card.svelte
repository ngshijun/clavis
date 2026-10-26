<script lang="ts">
	import { onMount } from 'svelte';
	import { LineChart } from 'layerchart';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Week } from '#lib/server/dashboard.js';
	import { percent } from './percent.js';

	/**
	 * The average score of the practice finished in each of the last eight
	 * weeks, a week being seven days back from now. A week with no practice
	 * has no point. A week is named by the day it began, which only the
	 * reader's browser knows, so the chart is drawn there.
	 */
	let { weeks }: { weeks: Week[] } = $props();

	const config = {
		average: { label: m.dashboard_column_average(), color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	const data = $derived(
		weeks.flatMap((week) =>
			week.average === null
				? []
				: [
						{
							at: 7 - week.weeksAgo,
							average: Math.round(week.average * 100),
							sessions: week.sessions
						}
					]
		)
	);
	const latest = $derived(weeks.at(-1));

	let here = $state(false);
	onMount(() => {
		here = true;
	});

	/** The day a week began, by its place on the chart: 7 is the last seven days. */
	function weekOf(at: number): string {
		if (at === 7) return m.dashboard_weeks_this();
		const began = new Date(Date.now() - (8 - at) * 7 * 86_400_000);
		return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short' }).format(began);
	}
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_weeks_title()}</Card.Title>
		<Card.Description>{m.dashboard_weeks_description()}</Card.Description>
		{#if latest}
			<Card.Action class="text-end">
				<span class="block text-xs text-muted-foreground">{m.dashboard_weeks_this()}</span>
				<span class="block text-xl font-semibold tabular-nums">{percent(latest.average)}</span>
				<span class="block text-xs text-muted-foreground">
					{m.dashboard_weeks_sessions({ count: latest.sessions })}
				</span>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if data.length === 0}
			<p class="text-muted-foreground">{m.dashboard_practice_empty()}</p>
		{:else}
			<Chart.Container {config} class="aspect-auto h-40 w-full">
				{#if here}
					<LineChart
						{data}
						x="at"
						xDomain={[0, 7]}
						yDomain={[0, 100]}
						points={{ r: 3.5 }}
						padding={{ top: 8, right: 28, bottom: 24, left: 36 }}
						series={[{ key: 'average', label: config.average.label, color: config.average.color }]}
						props={{
							spline: { strokeWidth: 2 },
							xAxis: { format: weekOf, ticks: [1, 3, 5, 7] },
							yAxis: { format: (value: number) => `${value}%`, ticks: [0, 50, 100] }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(at: number) => weekOf(at)} />
						{/snippet}
					</LineChart>
				{/if}
			</Chart.Container>
		{/if}
	</Card.Content>
</Card.Root>
