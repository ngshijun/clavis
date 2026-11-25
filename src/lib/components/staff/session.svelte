<script lang="ts">
	import BackButton from '#lib/components/app/back-button.svelte';
	import Day from '#lib/components/app/day.svelte';
	import { setRunner } from '#lib/components/runner/context.js';
	import Review from '#lib/components/runner/review.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { initials } from '#lib/initials.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { SessionRead } from '#lib/server/staff.js';

	/**
	 * A student's finished practice as the classroom's staff read it: the page the
	 * student was shown when they finished, headed by whose it is and when,
	 * and with the right answer under each one that fell short. The student
	 * is never shown those. It is opened from the student's page, from an
	 * assignment and from the dashboard, and Back returns to whichever it was.
	 */
	let { data }: { data: SessionRead } = $props();

	setRunner({
		imageUrl: (path) => (path ? data.imageBase + path : undefined),
		theirs: true
	});
</script>

<Review
	run={data.review.run}
	answers={data.review.answers}
	marked={data.review.marked}
	rightAnswers={data.review.rightAnswers}
>
	{#snippet lead()}
		<Card.Root class="flex-row items-center gap-3 p-4">
			<Avatar.Root>
				<Avatar.Fallback>{initials(data.student.name)}</Avatar.Fallback>
			</Avatar.Root>
			<div class="grid min-w-0 leading-snug">
				<span class="truncate font-semibold">{data.student.name}</span>
				<Day
					at={data.review.completedAt}
					time
					say={(day) => m.assignment_finished_on({ day })}
					class="text-xs text-muted-foreground"
				/>
			</div>
		</Card.Root>
	{/snippet}
	{#snippet actions()}
		<BackButton href={data.back} label={m.review_back({ name: data.student.name })} />
	{/snippet}
</Review>
