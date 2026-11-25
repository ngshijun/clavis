<script lang="ts">
	import type { Snippet } from 'svelte';
	import { beforeNavigate, goto, invalidate, refreshAll } from '$app/navigation';
	import { refusal, toastError } from '#lib/components/rows/feedback.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { postAction } from '#lib/form-actions.js';
	import type { Answers, Marked, Run } from '#lib/items/run.js';
	import { isAnswered } from '#lib/items/served.js';
	import { ACCOUNT } from '#lib/navigation.js';
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
		/** What else can be done once the run is marked, after Practise Again. */
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
			if (result.type === 'success' && result.data) {
				marked = result.data.marked as Marked;
				// A finished run may have done an assignment, which the sidebar counts.
				void invalidate(ACCOUNT);
			}
			// A dropped connection is told apart, since the answers are still here to be sent again.
			else toastError(refusal(result) ?? m.error_unexpected());
		} finally {
			finishing = false;
		}
	}

	/**
	 * A run lives on this page alone until it is finished, so leaving one that has an
	 * answer in it would throw the answers away. The pupil is asked first, wherever they
	 * were going: a classroom in the sidebar, the breadcrumb, Back.
	 */
	const underway = $derived(!marked && Object.values(answers).some((answer) => isAnswered(answer)));
	/** Where the pupil was going when they were asked. */
	let leaving = $state<{ url: URL; delta?: number } | null>(null);
	let passing = false;

	beforeNavigate((navigation) => {
		if (passing || !underway) return;
		// For a navigation that unloads the page, cancelling is what brings up the browser's own prompt.
		navigation.cancel();
		if (navigation.type !== 'leave' && navigation.to) {
			leaving = {
				url: navigation.to.url,
				delta: navigation.type === 'popstate' ? navigation.delta : undefined
			};
		}
	});

	function leave() {
		const target = leaving;
		leaving = null;
		if (!target) return;
		passing = true;
		// Back and Forward are taken again as such, so the history is left as it was.
		if (target.delta) history.go(target.delta);
		else void goto(target.url);
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
			<Button variant="outline" size="lg" onclick={again}>{m.practice_again()}</Button>
			{@render more?.()}
		{/snippet}
	</Review>
{:else}
	<!-- Made again for each deal, so Try Again starts from the first question. -->
	{#key run}
		<Runner {run} bind:answers {finishing} onfinish={finish} />
	{/key}
{/if}

<AlertDialog.Root bind:open={() => leaving !== null, (shown) => !shown && (leaving = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.run_leave_title()}</AlertDialog.Title>
			<AlertDialog.Description>{m.run_leave_description()}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.run_keep_answering()}</AlertDialog.Cancel>
			<Button onclick={leave}>{m.run_leave()}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
