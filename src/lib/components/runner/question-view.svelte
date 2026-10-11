<script lang="ts">
	import type { AnswerKey } from '#lib/items/key.js';
	import { isAnswered, type ItemResponse, type ServedItem } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { answerOf } from './answers/index.js';
	import { getRunner } from './context.js';
	import type { AnswerMark } from './marks.js';

	/**
	 * One question as a pupil gets it: what it asks, its picture, and the place
	 * it is answered in. Read-only, it shows an answer that was given, under a
	 * line that says whose it is; with a mark, it shows on the answer how each
	 * part of it was marked. Given the right answer, it shows that beneath,
	 * drawn as an answer got wholly right: that is for staff, never a pupil.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark,
		right
	}: {
		item: ServedItem;
		answer: ItemResponse;
		readonly?: boolean;
		/** How the answer was marked. Nothing is marked on an answer that was not given. */
		mark?: AnswerMark;
		/** The right answer, for a reader who may see it. */
		right?: AnswerKey;
	} = $props();

	const runner = getRunner();
	const Answer = $derived(answerOf(item.type));
	// Label a Picture draws its picture itself, with the parts' numbers on it.
	const picture = $derived(
		item.type === 'label_picture' ? undefined : runner.imageUrl(item.image_path)
	);

	const caption = 'px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase';
</script>

<div class="flex flex-col gap-4">
	{#if item.question}
		<!-- Words stand a little further in than boxes do, clear of the corner's curve. -->
		<p class="px-2 text-xl leading-snug font-semibold wrap-break-word whitespace-pre-line">
			{item.question}
		</p>
	{/if}
	{#if picture}
		<img src={picture} alt="" class="max-h-64 max-w-full self-start rounded-lg border bg-card" />
	{/if}
	{#if readonly}
		{@const answered = isAnswered(answer)}
		<div class="flex flex-col gap-2">
			<span class={caption}>
				{runner.theirs ? m.run_their_answer() : m.run_your_answer()}
			</span>
			{#if !answered}
				<p
					class="rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-lg text-muted-foreground italic"
				>
					{runner.theirs ? m.run_their_no_answer() : m.run_no_answer()}
				</p>
			{/if}
			<Answer {item} bind:answer readonly mark={answered ? mark : undefined} />
		</div>
		{#if right}
			<div class="flex flex-col gap-2">
				<span class={caption}>{m.run_correct_answer()}</span>
				<Answer
					{item}
					answer={right.answer}
					readonly
					mark={{ correct: 1, total: 1, right: right.parts }}
				/>
			</div>
		{/if}
	{:else}
		<Answer {item} bind:answer />
	{/if}
</div>
