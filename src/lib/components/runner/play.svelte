<script lang="ts">
	import type { Snippet } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { postAction } from '#lib/form-actions.js';
	import type { Answers, Marked, Run } from '#lib/items/run.js';
	import { m } from '#lib/paraglide/messages.js';
	import { setRunner } from './context.js';
	import Review from './review.svelte';
	import Runner from './runner.svelte';

	/**
	 * A stage played from the first question to the marks: every question in
	 * turn, then, once the pupil finishes, how each was marked and the tips.
	 * The page it is on deals the run and owns the action that marks it.
	 */
	let {
		run,
		imageBase,
		action,
		more
	}: {
		/** Never empty: a stage with no question is not played. */
		run: Run;
		/** What a picture's path is appended to, to get its URL. */
		imageBase: string;
		/** The form action the answers are posted to. It answers with `marked`. */
		action: string;
		/** What else can be done once the run is marked, after Try Again. */
		more?: Snippet;
	} = $props();

	setRunner({ imageUrl: (path) => (path ? imageBase + path : undefined) });

	let answers = $state<Answers>({});
	let marked = $state<Marked>();
	let finishing = $state(false);

	async function finish() {
		finishing = true;
		try {
			const body = new FormData();
			body.set(
				'answers',
				JSON.stringify(
					Object.entries(answers).map(([question_id, answer]) => ({ question_id, ...answer }))
				)
			);
			const result = await postAction(action, body);
			if (result.type === 'success' && result.data) marked = result.data.marked as Marked;
			else toast.error(m.error_unexpected());
		} finally {
			finishing = false;
		}
	}

	/** Deals the stage again and starts over. */
	async function again() {
		await refreshAll();
		answers = {};
		marked = undefined;
	}
</script>

{#if marked}
	<Review {run} {answers} {marked}>
		{#snippet actions()}
			<Button variant="outline" onclick={again}>{m.run_try_again()}</Button>
			{@render more?.()}
		{/snippet}
	</Review>
{:else}
	<!-- Made again for each deal, so Try Again starts from the first question. -->
	{#key run}
		<Runner {run} bind:answers {finishing} onfinish={finish} />
	{/key}
{/if}
