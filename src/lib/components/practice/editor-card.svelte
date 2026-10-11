<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import type { Draft, PassageDraft } from './editor.svelte.js';
	import { hint } from './styles.js';

	/**
	 * The card a question and a passage are both edited in: a head, the form
	 * beside a picture of what a pupil gets, and the foot that saves the draft
	 * or puts it back.
	 *
	 * Its shapes turn about one centre, as the radius ladder asks. The card's
	 * corners are 26px and the pupil view's 18px, so the pupil view sits 8px
	 * inside the card: the body pads 8px and the form column brings the rest of
	 * its own room. The pupil view pads 8px in turn, which leaves 10px corners
	 * (`rounded-lg`) for the boxes in it.
	 */
	let {
		draft,
		saving,
		onsave,
		onrevert,
		head,
		form,
		preview,
		class: className
	}: {
		/** What is being edited: the form and the pupil view are made again for each. */
		draft: Draft | PassageDraft;
		/** Whether a Save is on its way. */
		saving: boolean;
		onsave: () => void;
		onrevert: () => void;
		/** What is edited and what can be done with it as a whole. */
		head: Snippet;
		/** The fields, as a column of them. */
		form: Snippet;
		/** What goes under the "Pupil view" caption. */
		preview: Snippet;
		class?: string;
	} = $props();

	/** Nothing to save or to revert, or a Save on its way. */
	const idle = $derived(!draft.dirty || saving);

	let body = $state<HTMLElement>();

	/** Puts the form back at its top, for when something else is opened. */
	export function scrollToTop() {
		body?.scrollTo({ top: 0 });
	}
</script>

<!--
	`gap-0 py-0`: the head, the body and the foot each bring their own padding. The card is a
	container, so what is in its head can lay itself out by the card's width.
-->
<Card.Root class={cn('@container gap-0 py-0', className)}>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2 py-4 ps-6 pe-4">
		{@render head()}
	</div>

	<div
		bind:this={body}
		class="flex flex-wrap items-start gap-2 p-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
	>
		<!-- Made again for each draft, so a form may set itself up from what it edits once. -->
		{#key draft}
			<div class="flex min-w-0 flex-[3_1_22rem] flex-col gap-5 px-4 pb-4">
				{@render form()}
			</div>

			<!-- Where the card scrolls on its own, this stays in view beside a long form. -->
			<section
				aria-label={m.practice_pupil_view()}
				class="flex min-w-0 flex-[2_1_16.25rem] flex-col gap-3 rounded-2xl bg-background p-2 xl:sticky xl:top-0"
			>
				<!-- Words stand a little further in than boxes do, clear of the corner's curve. -->
				<span
					class="px-2 pt-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase"
				>
					{m.practice_pupil_view()}
				</span>
				{@render preview()}
			</section>
		{/key}
	</div>

	<div class="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
		<span
			aria-live="polite"
			class={cn(hint, 'me-auto', draft.issues.length > 0 && 'text-destructive')}
		>
			{#if draft.issues.length > 0}
				{m.practice_fix_to_save()}
			{:else if draft.dirty}
				{m.practice_unsaved()}
			{/if}
		</span>
		<!--
			Dimmed rather than disabled while there is nothing to save. A disabled button cannot hold
			the focus, so pressing Save would drop the focus to the top of the page as it greys out.
		-->
		<Button
			variant="outline"
			aria-disabled={idle}
			class="aria-disabled:pointer-events-none aria-disabled:opacity-50"
			onclick={() => idle || onrevert()}
		>
			{m.practice_revert()}
		</Button>
		<Button
			aria-disabled={idle}
			class="aria-disabled:pointer-events-none aria-disabled:opacity-50"
			onclick={() => idle || onsave()}
		>
			{#if saving}
				<Spinner data-icon="inline-start" />
			{/if}
			{m.action_save()}
		</Button>
	</div>
</Card.Root>
