<script lang="ts">
	import Day from '#lib/components/app/day.svelte';
	import { setRunner } from '#lib/components/runner/context.js';
	import Review from '#lib/components/runner/review.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * A student's own finished practice, read back: the page they were shown
	 * when they finished, headed by when that was. As then, a question got
	 * wrong shows its tip and never its right answer.
	 */
	let { data }: PageProps = $props();

	setRunner({ imageUrl: (path) => (path ? data.imageBase + path : undefined) });
</script>

<Review run={data.review.run} answers={data.review.answers} marked={data.review.marked}>
	{#snippet lead()}
		<Card.Root class="p-4">
			<Day
				at={data.review.completedAt}
				time
				say={(day) => m.assignment_finished_on({ day })}
				class="px-2 font-semibold"
			/>
		</Card.Root>
	{/snippet}
	{#snippet actions()}
		<Button variant="outline" href={data.practice}>{m.run_back_to_practice()}</Button>
		<Button href={data.again}>{m.practice_again()}</Button>
	{/snippet}
</Review>
