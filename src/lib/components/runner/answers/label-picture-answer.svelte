<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import type { ItemResponse, ServedLabelPicture } from '#lib/items/served.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { bankWords, nextPlace } from '../bank.js';
	import { getRunner } from '../context.js';
	import { chip, chips, marked, number, slot } from '../styles.js';
	import MarkIcon from '../mark-icon.svelte';
	import { partVerdict, type AnswerMark } from '../marks.js';

	/**
	 * A Label a Picture question: the picture with a number on each part, a
	 * place to answer for each number, and in a word bank the words to choose
	 * from.
	 */
	let {
		item,
		answer = $bindable(),
		readonly = false,
		mark
	}: {
		item: ServedLabelPicture;
		answer: ItemResponse;
		readonly?: boolean;
		/** Set on an answer that was marked, to show the marks on it. */
		mark?: AnswerMark;
	} = $props();

	const runner = getRunner();
	const url = $derived(runner.imageUrl(item.image_path));
	const ids = $derived(item.markers.map((marker) => marker.id));
	const labels = $derived(answer.response?.labels ?? []);
	const valueOf = (id: string) => labels.find((label) => label.id === id)?.value ?? '';
	const verdictOf = (id: string) => (valueOf(id) ? partVerdict(mark, id) : undefined);

	function write(id: string, value: string) {
		const next = [...labels.filter((label) => label.id !== id), ...(value ? [{ id, value }] : [])];
		answer = next.length > 0 ? { response: { labels: next } } : {};
	}

	// Word bank: the part the next word goes to, when the pupil has chosen one.
	let chosen = $state<string>();
	const words = $derived(
		bankWords(
			item.bank ?? [],
			labels.map((label) => label.value),
			false
		)
	);

	function place(word: string) {
		const id = nextPlace(ids, (each) => valueOf(each) !== '', chosen);
		if (id === undefined) return;
		write(id, word);
		chosen = undefined;
	}
</script>

<div class="flex flex-col gap-4">
	{#if url}
		<!-- The frame is exactly the picture's box, so a number set by percentage keeps its spot. -->
		<div class="relative w-full max-w-2xl">
			<img src={url} alt="" class="block w-full rounded-lg border bg-card" />
			{#each item.markers as marker (marker.id)}
				<span
					class={cn(number, 'absolute -translate-1/2 ring-2 ring-card')}
					style:left="{marker.x}%"
					style:top="{marker.y}%"
				>
					{marker.number}
				</span>
			{/each}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2">
		{#each item.markers as marker (marker.id)}
			{@const verdict = verdictOf(marker.id)}
			<div class="flex min-w-0 items-center gap-1.5">
				<span class={number} aria-hidden="true">{marker.number}</span>
				{#if item.mode === 'bank'}
					<Button
						variant="ghost"
						aria-label={m.item_part({ n: marker.number })}
						aria-pressed={chosen === marker.id}
						data-filled={valueOf(marker.id) ? '' : undefined}
						data-active={chosen === marker.id ? '' : undefined}
						disabled={readonly}
						class={cn(slot, 'min-w-0 flex-1', verdict && marked[verdict])}
						onclick={() => {
							if (valueOf(marker.id)) write(marker.id, '');
							chosen = marker.id;
						}}
					>
						<span class="truncate">{valueOf(marker.id)}</span>
					</Button>
				{:else}
					<Input
						aria-label={m.item_part({ n: marker.number })}
						autocomplete="off"
						autocapitalize="off"
						spellcheck={false}
						{readonly}
						class={cn('min-w-0 flex-1', verdict && marked[verdict])}
						bind:value={() => valueOf(marker.id), (value) => write(marker.id, value)}
					/>
				{/if}
				{#if verdict}
					<MarkIcon {verdict} />
				{/if}
			</div>
		{/each}
	</div>

	{#if item.mode === 'bank' && words.length > 0 && !readonly}
		<div class={chips}>
			{#each words as { word, free }, at (at)}
				<Button variant="secondary" disabled={!free} class={chip} onclick={() => place(word)}>
					<span class="truncate">{word}</span>
				</Button>
			{/each}
		</div>
	{/if}
</div>
