<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { markFigure } from '#lib/items/run.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { TopicStages } from '#lib/server/practice.js';
	import type { Score } from '#lib/server/run.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One topic's stages for a pupil, as stops along a trail that runs left to
	 * right and wraps where the card ends. A stop they have practised shows
	 * what they scored on it last. Every stop is open: the order recommends
	 * and never locks.
	 *
	 * A 22px card with an 8px inset, so a stop has 14px corners.
	 */
	let {
		topic,
		scores,
		next,
		href
	}: {
		topic: TopicStages;
		/** The pupil's last score on each stage they have practised, by the stage's id. */
		scores: Record<string, Score>;
		/** The stage to suggest: the first on the page not yet practised. */
		next: string | undefined;
		href: (stageId: string) => string;
	} = $props();

	/** The height of the strip the trail runs in, in px, and how far off its middle the stops sit in turn. */
	const lane = 104;
	const wave = [0, -10, 0, 10];
	const heightOf = (index: number) => lane / 2 + wave[index % wave.length];

	/**
	 * The trail between two stops is one S-curve, level at both. Each stop
	 * draws the half on its own side, in a box 100 wide, so the trail holds
	 * together whatever the width of a stop and goes on over a wrap.
	 */
	const arrive = (from: number, to: number) =>
		`M0 ${(from + to) / 2} C12.5 ${(from + 3 * to) / 4} 25 ${to} 50 ${to}`;
	const leave = (from: number, to: number) =>
		`M50 ${from} C75 ${from} 87.5 ${(3 * from + to) / 4} 100 ${(from + to) / 2}`;

	const played = (index: number) => scores[topic.stages[index].id] !== undefined;
	/** The trail is walked from a practised stop to the one after it, if that is practised or suggested. */
	const walked = (from: number) =>
		played(from) && (played(from + 1) || topic.stages[from + 1].id === next);

	const stops = $derived(
		topic.stages.map((stage, index) => {
			const y = heightOf(index);
			const first = index === 0;
			const last = index === topic.stages.length - 1;
			// The two halves of the trail this stop draws, each with whether it is walked.
			const halves = [
				...(first ? [] : [{ d: arrive(heightOf(index - 1), y), walked: walked(index - 1) }]),
				...(last ? [] : [{ d: leave(y, heightOf(index + 1)), walked: walked(index) }])
			];
			const drawn = (isWalked: boolean) =>
				halves
					.filter((half) => half.walked === isWalked)
					.map((half) => half.d)
					.join(' ');
			return {
				stage,
				number: index + 1,
				score: scores[stage.id],
				y,
				ahead: drawn(false),
				behind: drawn(true)
			};
		})
	);
	const done = $derived(stops.filter((stop) => stop.score).length);

	/** A stop's round button: raised on a darker edge, lifted under the pointer and pressed down onto the edge. */
	const node =
		'absolute left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xl font-extrabold tabular-nums transition-[translate,box-shadow] duration-100 group-hover:translate-y-[calc(-50%-0.125rem)] group-active:translate-y-[calc(-50%+0.25rem)] group-active:shadow-none';
	const edge = 'shadow-[0_4px_0_color-mix(in_oklab,var(--primary),black_35%)]';
</script>

<!-- The id is what the stage page's breadcrumb points at, to land on this topic. -->
<Card.Root id={topic.id} class="scroll-mt-page gap-1 rounded-3xl p-2">
	<Card.Header class="gap-0 rounded-none px-2 pt-2 pb-1">
		<Card.Title class="font-semibold">
			<h2>{topic.name}</h2>
		</Card.Title>
		<Card.Description class="text-xs">
			{m.practice_stages_done({ done, count: stops.length })}
		</Card.Description>
		<Card.Action class="self-center">
			<Progress value={done} max={stops.length} class="h-1.5 w-24" aria-hidden="true" />
		</Card.Action>
	</Card.Header>
	<Card.Content class="px-0">
		<ol
			class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]"
			aria-label={m.practice_stages_of({ name: topic.name })}
		>
			{#each stops as stop (stop.stage.id)}
				{@const suggested = stop.stage.id === next}
				<li class="flex min-w-0">
					<a
						href={href(stop.stage.id)}
						class="group flex min-w-0 flex-1 flex-col rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<span class="relative block" style:height="{lane}px">
							<!--
								The dots start a little way in, so none is cut in half where two stops
								meet; the walked trail is one flat colour, so its ends do not show there.
							-->
							<svg
								class="absolute inset-0 size-full overflow-visible fill-none"
								viewBox="0 0 100 {lane}"
								preserveAspectRatio="none"
								stroke-width="8"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<path
									class="stroke-border-strong/60"
									d={stop.ahead}
									stroke-dasharray="1 16"
									stroke-dashoffset="-8"
									vector-effect="non-scaling-stroke"
								/>
								<path
									class="stroke-[color-mix(in_oklab,var(--primary)_40%,var(--card))]"
									d={stop.behind}
									vector-effect="non-scaling-stroke"
								/>
							</svg>
							<span
								class={cn(
									node,
									stop.score && [edge, 'bg-primary text-primary-foreground'],
									!stop.score &&
										suggested && [edge, 'size-18 border-4 border-primary bg-card text-primary'],
									!stop.score &&
										!suggested &&
										'border-2 border-border-strong bg-card shadow-[0_4px_0_var(--border-strong)]'
								)}
								style:top="{stop.y}px"
							>
								{#if suggested}
									<span
										class="absolute -inset-2.5 rounded-full border-2 border-primary/50 motion-safe:animate-pulse"
									></span>
								{/if}
								{stop.number}
							</span>
						</span>
						<span class="flex flex-col items-center gap-1 px-1.5 pt-1 pb-3 text-center">
							<span class="text-sm font-medium wrap-break-word">{stop.stage.name}</span>
							<span class="text-xs text-muted-foreground">
								{m.count_questions({ count: stop.stage.questionCount })}
							</span>
							{#if stop.score}
								<Badge
									variant={stop.score.marks === stop.score.total ? 'default' : 'secondary'}
									class="tabular-nums"
								>
									<span class="sr-only">
										{m.practice_last_score({
											marks: markFigure(stop.score.marks),
											total: stop.score.total
										})}
									</span>
									<span aria-hidden="true">
										{markFigure(stop.score.marks)}/{stop.score.total}
									</span>
								</Badge>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
