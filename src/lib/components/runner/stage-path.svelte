<script lang="ts" module>
	import type { Stage, TopicStages } from '#lib/server/practice.js';

	/** One stage on the path: the stage, its topic, and its place among the topic's stages, from 1. */
	export interface Stop {
		topic: TopicStages;
		stage: Stage;
		number: number;
	}

	/** Every stage of some topics as a stop, by the stage's id. */
	export function stopsOf(topics: TopicStages[]): Record<string, Stop> {
		return Object.fromEntries(
			topics.flatMap((topic) =>
				topic.stages.map((stage, index) => [stage.id, { topic, stage, number: index + 1 }])
			)
		);
	}
</script>

<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { starsOf } from '#lib/items/stars.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Score } from '#lib/server/run.js';
	import { cn } from '#lib/utils.js';
	import Star from './star.svelte';

	/**
	 * One topic's stages for a pupil, as stops along a trail that runs left to
	 * right and wraps where the card ends. Each stop wears, over its top, the
	 * stars of the best they have scored on it. Every stop is open: the order recommends
	 * and never locks. Pressing a stop picks its stage; the page says what
	 * comes of that.
	 *
	 * A 22px card with an 8px inset, so a stop has 14px corners.
	 */
	let {
		topic,
		best,
		onpick
	}: {
		topic: TopicStages;
		/** The pupil's best score on each stage they have practised, by the stage's id. */
		best: Record<string, Score>;
		onpick: (stop: Stop) => void;
	} = $props();

	/**
	 * The height of the strip the trail runs in, in px, the line its stops are
	 * set about, and how far off that line they sit in turn. The line is below
	 * the strip's middle, to leave room for the stars over a stop.
	 */
	const lane = 116;
	const middle = 66;
	const wave = [0, -10, 0, 10];
	const heightOf = (index: number) => middle + wave[index % wave.length];

	/**
	 * Where a stop's three stars stand, as on the map of a game: on an arc
	 * over its top, the outer two leaning away and the middle one larger,
	 * higher and in front. They are drawn outer two first so that the middle
	 * one overlaps them, and are earned from the left: `from` is how many
	 * stars it takes for each to be gold.
	 */
	const crown = [
		{ from: 1, turn: -40, out: 3, lean: -16, size: 'size-6.5' },
		{ from: 3, turn: 40, out: 3, lean: 16, size: 'size-6.5' },
		{ from: 2, turn: 0, out: 6, lean: 0, size: 'size-8.5' }
	];

	/**
	 * The trail between two stops is one S-curve, level at both. Each stop
	 * draws the half on its own side, in a box 100 wide, so the trail holds
	 * together whatever the width of a stop and goes on over a wrap.
	 */
	const arrive = (from: number, to: number) =>
		`M0 ${(from + to) / 2} C12.5 ${(from + 3 * to) / 4} 25 ${to} 50 ${to}`;
	const leave = (from: number, to: number) =>
		`M50 ${from} C75 ${from} 87.5 ${(3 * from + to) / 4} 100 ${(from + to) / 2}`;

	const played = (index: number) => best[topic.stages[index].id] !== undefined;
	/** The trail is walked between two stops that have both been practised. */
	const walked = (from: number) => played(from) && played(from + 1);

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
				played: played(index),
				stars: played(index) ? starsOf(best[stage.id].marks, best[stage.id].total) : 0,
				y,
				ahead: drawn(false),
				behind: drawn(true)
			};
		})
	);
	const done = $derived(stops.filter((stop) => stop.played).length);

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
		<Card.Description>
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
				<li class="flex min-w-0">
					<button
						type="button"
						class="group flex min-w-0 flex-1 flex-col rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
						onclick={() => onpick({ topic, stage: stop.stage, number: stop.number })}
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
									stop.played
										? [edge, 'bg-primary text-primary-foreground']
										: 'border-2 border-border-strong bg-card shadow-[0_4px_0_var(--border-strong)]'
								)}
								style:top="{stop.y}px"
							>
								{stop.number}
								<!-- A star is set at the stop's middle, turned to its place on the arc, moved out to the rim, and then stood up to its lean. -->
								<span
									role="img"
									aria-label={m.stars_count({ count: stop.stars })}
									class="absolute inset-0"
								>
									{#each crown as place (place.from)}
										<Star
											earned={stop.stars >= place.from}
											ring
											class={cn('absolute top-1/2 left-1/2', place.size)}
											style="transform: translate(-50%, -50%) rotate({place.turn}deg) translateY({-32 -
												place.out}px) rotate({place.lean - place.turn}deg)"
										/>
									{/each}
								</span>
							</span>
						</span>
						<span class="flex flex-col items-center gap-1 px-1.5 pt-1 pb-3 text-center">
							<span class="text-sm font-medium wrap-break-word">{stop.stage.name}</span>
							<span class="text-xs text-muted-foreground">
								{m.count_questions({ count: stop.stage.questionCount })}
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ol>
	</Card.Content>
</Card.Root>
