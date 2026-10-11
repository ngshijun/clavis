<script lang="ts">
	import { tick } from 'svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Input } from '#lib/components/ui/input/index.js';
	import { newId } from '#lib/items/kinds.js';
	import type { Item, MatchingPayload } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getEditor } from '../editor.svelte.js';
	import AddButton from '../fields/add-button.svelte';
	import FormField from '../fields/form-field.svelte';
	import Issue from '../fields/issue.svelte';
	import ItemRow from '../fields/item-row.svelte';
	import PictureField from '../fields/picture-field.svelte';
	import { hint, rows } from '../styles.js';
	import ArrangeItemChips from './arrange-item-chips.svelte';
	import { addRow, answerOf, extrasOf, removeRow, setAnswer } from './matching-pairs.js';

	/**
	 * The pairs of a Matching question, a row each, and the extra answers
	 * that go with nothing. The payload keeps the left and the right items
	 * apart and joins them by id; `matching-pairs.ts` is what turns a row's
	 * edit into that.
	 */
	let { payload = $bindable() }: { payload: MatchingPayload } = $props();

	const editor = getEditor();

	let list = $state<HTMLElement>();

	async function add() {
		const id = addRow(payload);
		await tick();
		list?.querySelector<HTMLInputElement>(`[data-item="${CSS.escape(id)}"] input`)?.focus();
	}

	const rightIssue = (item: Item | undefined) =>
		item &&
		editor.issue(
			'right',
			payload.right.findIndex((each) => each.id === item.id),
			'text'
		);

	/**
	 * What is wrong with a row, each thing once: with its left item, with its
	 * answer, or with there being no answer at all.
	 */
	function issuesOf(index: number, answer: Item | undefined) {
		const left = editor.issue('left', index, 'text');
		const right = editor.issue('left', index) ?? rightIssue(answer);
		return {
			left,
			right,
			messages: [...new Set([left, right])].filter((each) => each !== undefined)
		};
	}
</script>

<FormField
	label={m.practice_matching_pairs()}
	hint={m.practice_matching_pairs_hint()}
	error={editor.issue('left') ?? editor.issue('right')}
>
	<div bind:this={list} class={rows}>
		{#each payload.left as left, index (left.id)}
			{@const n = index + 1}
			{@const answer = answerOf(payload, left.id)}
			{@const issues = issuesOf(index, answer)}
			<div data-item={left.id}>
				<ItemRow
					error={issues.messages[0]}
					removeLabel={m.practice_matching_remove({ n })}
					onremove={payload.left.length > 1 ? () => removeRow(payload, left.id) : undefined}
				>
					<Input
						bind:value={left.text}
						class="h-8"
						aria-label={m.practice_arrange_item({ n })}
						aria-invalid={issues.left ? true : undefined}
					/>
					<PictureField
						bind:path={left.image_path}
						size="row"
						label={m.practice_arrange_item_image({ n })}
					/>
					<ArrowRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<Input
						bind:value={
							() => answer?.text ?? '',
							(text) => setAnswer(payload, left.id, { text, image_path: answer?.image_path })
						}
						class="h-8"
						aria-label={m.practice_matching_right({ n })}
						aria-invalid={issues.right ? true : undefined}
					/>
					<PictureField
						bind:path={
							() => answer?.image_path,
							(path) => setAnswer(payload, left.id, { text: answer?.text ?? '', image_path: path })
						}
						size="row"
						label={m.practice_matching_right_image({ n })}
					/>
					{#snippet below()}
						{#each issues.messages.slice(1) as message (message)}
							<Issue {message} />
						{/each}
					{/snippet}
				</ItemRow>
			</div>
		{/each}
	</div>
	<AddButton label={m.practice_matching_add()} onclick={add} />
	<p class={hint}>{m.practice_matching_shared_hint()}</p>
</FormField>

<FormField label={m.practice_matching_extras()} hint={m.practice_matching_extras_hint()}>
	<ArrangeItemChips
		items={extrasOf(payload)}
		addLabel={m.practice_matching_extra_add()}
		label={(n) => m.practice_matching_extra({ n })}
		imageLabel={(n) => m.practice_matching_extra_image({ n })}
		removeLabel={(n) => m.practice_matching_extra_remove({ n })}
		issue={rightIssue}
		onadd={() => {
			const extra = { id: newId(), text: '' };
			payload.right.push(extra);
			return extra.id;
		}}
		onremove={(id) => (payload.right = payload.right.filter((item) => item.id !== id))}
	/>
</FormField>
