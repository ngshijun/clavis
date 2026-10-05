<script lang="ts">
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import ChevronsDownUpIcon from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import { dragHandleZone } from 'svelte-dnd-action';
	import AddField from '#lib/components/curriculum/add-field.svelte';
	import { setRequestDelete, type DeleteTarget } from '#lib/components/curriculum/context.js';
	import { settle } from '#lib/components/curriculum/feedback.js';
	import GradeSection from '#lib/components/curriculum/grade-section.svelte';
	import { FLIP_MS, saveOrder } from '#lib/components/curriculum/reorder.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/**
	 * The whole curriculum on one page: every grade level, its subjects side by
	 * side, each subject's topics beneath it. It is set up once and then mostly
	 * read, so everything is visible without opening anything, and everything is
	 * edited where it stands.
	 */
	let { data }: PageProps = $props();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let grades = $derived(data.grades);

	/** The grade levels folded away. Kept by id, so the fold survives a reorder and a reload of the data. */
	const collapsed = new SvelteSet<string>();
	const anyOpen = $derived(grades.some((grade) => !collapsed.has(grade.id)));

	function toggleAll() {
		if (anyOpen) for (const grade of grades) collapsed.add(grade.id);
		else collapsed.clear();
	}

	let deleting = $state<DeleteTarget>();
	let deleteOpen = $state(false);
	let deletePending = $state(false);

	setRequestDelete((target) => {
		deleting = target;
		deleteOpen = true;
	});

	const deleteDescription = $derived(
		deleting?.kind === 'grade'
			? m.curriculum_delete_grade()
			: deleting?.kind === 'subject'
				? m.curriculum_delete_subject()
				: m.curriculum_delete_topic()
	);
</script>

<div class="flex flex-col gap-6">
	{#if grades.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<ListTreeIcon />
				</Empty.Media>
				<Empty.Title>{m.curriculum_empty_title()}</Empty.Title>
				<Empty.Description>{m.curriculum_empty_description()}</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="flex justify-end">
			<Button variant="outline" size="sm" onclick={toggleAll}>
				{#if anyOpen}
					<ChevronsDownUpIcon data-icon="inline-start" />
					{m.curriculum_collapse_all()}
				{:else}
					<ChevronsUpDownIcon data-icon="inline-start" />
					{m.curriculum_expand_all()}
				{/if}
			</Button>
		</div>
	{/if}

	<div
		aria-label={m.curriculum_grades()}
		class="flex flex-col gap-8"
		use:dragHandleZone={{
			items: grades,
			type: 'grades',
			flipDurationMs: FLIP_MS,
			dropTargetStyle: {}
		}}
		onconsider={(event) => (grades = event.detail.items)}
		onfinalize={(event) => {
			grades = event.detail.items;
			saveOrder({ kind: 'grade' }, data.grades, grades);
		}}
	>
		{#each grades as grade (grade.id)}
			<section aria-label={grade.name} animate:flip={{ duration: FLIP_MS }}>
				<GradeSection
					{grade}
					bind:open={
						() => !collapsed.has(grade.id),
						(open) => (open ? collapsed.delete(grade.id) : collapsed.add(grade.id))
					}
				/>
			</section>
		{/each}
	</div>

	<AddField
		place={{ kind: 'grade' }}
		placeholder={m.curriculum_add_grade()}
		label={m.curriculum_add_grade()}
	/>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{m.curriculum_delete_title({ name: deleting?.name ?? '' })}
			</AlertDialog.Title>
			<AlertDialog.Description>{deleteDescription}</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deletePending = true;
				return async ({ result }) => {
					await settle(result);
					deletePending = false;
					deleteOpen = false;
				};
			}}
		>
			<input type="hidden" name="kind" value={deleting?.kind} />
			<input type="hidden" name="id" value={deleting?.id} />
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={deletePending}>
					{m.action_cancel()}
				</AlertDialog.Cancel>
				<Button type="submit" variant="destructive" disabled={deletePending}>
					{#if deletePending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.action_delete()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
