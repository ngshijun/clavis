<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import type { Draft, PassageDraft } from './editor.svelte.js';
	import { hint } from './styles.js';

	/**
	 * The card a question and a passage are both edited in: a head, and under
	 * it the form beside a picture of what a pupil gets.
	 *
	 * The head says what is open and whether it is saved, and holds what saves
	 * it or puts it back. It stays put while the form scrolls under it, so the
	 * state and Save are always in view, and nothing a person must see is at
	 * the bottom of the window.
	 *
	 * Its shapes turn about one centre, as the radius ladder asks. The card's
	 * corners are 26px and the pupil view's 18px, so the pupil view sits 8px
	 * inside the card: the body pads 8px and the form column brings the rest of
	 * its own room. The pupil view pads 8px in turn, which leaves 10px corners
	 * (`rounded-lg`) for the boxes in it.
	 */
	let {
		draft,
		title,
		saving,
		onsave,
		onrevert,
		actions,
		form,
		preview,
		previewHint,
		class: className
	}: {
		/** What is being edited: the form and the pupil view are made again for each. */
		draft: Draft | PassageDraft;
		/** What is open, as the head names it: "Question 4", "Passage". */
		title: string;
		/** Whether a Save is on its way. */
		saving: boolean;
		onsave: () => void;
		onrevert: () => void;
		/** What can be done with what is open as a whole, as icon buttons: copy it, delete it. */
		actions: Snippet;
		/** The fields, as a column of groups. */
		form: Snippet;
		/** What goes under the "Pupil view" caption. */
		preview: Snippet;
		/** A line beside the caption, for a pupil view that can be tried. */
		previewHint?: string;
		class?: string;
	} = $props();

	/** Nothing to save or to revert, or a Save on its way. */
	const idle = $derived(!draft.dirty || saving);

	let body = $state<HTMLElement>();
	/** Whether the form has scrolled under the head, which then shows its edge. */
	let scrolled = $state(false);

	/** Puts the form back at its top, for when something else is opened. */
	export function scrollToTop() {
		body?.scrollTo({ top: 0 });
	}
</script>

<!--
	`gap-0 py-0`: the head and the body each bring their own padding. The card is a container,
	so what is in it can lay itself out by the card's width.
-->
<Card.Root class={cn('@container gap-0 py-0', className)}>
	<div
		class={cn(
			'flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-4 ps-6 pe-4 transition-colors',
			scrolled ? 'border-border' : 'border-transparent'
		)}
	>
		<h2 class="text-base font-semibold">{title}</h2>
		<span aria-live="polite" class={cn(hint, 'flex items-center gap-1.5')}>
			{#if draft.issues.length > 0}
				<CircleAlertIcon class="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
				<span class="font-medium text-destructive">{m.practice_fix_to_save()}</span>
			{:else if draft.dirty}
				<span class="size-1.75 shrink-0 rounded-full bg-primary"></span>
				{m.practice_unsaved()}
			{/if}
		</span>
		<div class="ms-auto flex items-center gap-2">
			<div class="flex gap-1">
				{@render actions()}
			</div>
			<Separator orientation="vertical" class="data-vertical:h-5 data-vertical:self-center" />
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
	</div>

	<div
		bind:this={body}
		onscroll={(event) => (scrolled = event.currentTarget.scrollTop > 0)}
		class="flex flex-wrap items-start gap-2 p-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto"
	>
		<!-- Made again for each draft, so a form may set itself up from what it edits once. -->
		{#key draft}
			<div class="flex min-w-0 flex-[3_1_22rem] flex-col gap-6 px-4 pb-4">
				{@render form()}
			</div>

			<!-- Where the card scrolls on its own, this stays in view beside a long form. -->
			<section
				aria-label={m.practice_pupil_view()}
				class="flex min-w-0 flex-[2_1_16.25rem] flex-col gap-3 rounded-2xl bg-background p-2 xl:sticky xl:top-0"
			>
				<!-- Words stand a little further in than boxes do, clear of the corner's curve. -->
				<div class="flex flex-wrap items-baseline justify-between gap-x-2 px-2 pt-2 text-xs">
					<span class="font-semibold text-muted-foreground">{m.practice_pupil_view()}</span>
					{#if previewHint}
						<span class="text-muted-foreground">{previewHint}</span>
					{/if}
				</div>
				{@render preview()}
			</section>
		{/key}
	</div>
</Card.Root>
