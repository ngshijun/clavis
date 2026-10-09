<script lang="ts">
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import ChevronsDownUpIcon from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import { dragHandleZone } from 'svelte-dnd-action';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import GradeSection from '#lib/components/curriculum/grade-section.svelte';
	import AddField from '#lib/components/rows/add-field.svelte';
	import { setRequestDelete, type NamedRow } from '#lib/components/rows/context.js';
	import DeleteDialog from '#lib/components/rows/delete-dialog.svelte';
	import { FLIP_MS, saveOrder } from '#lib/components/rows/reorder.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
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

	let deleteDialog = $state<{ request: (target: NamedRow) => void }>();
	setRequestDelete((target) => deleteDialog?.request(target));
</script>

{#if grades.length > 0}
	<!-- Folding is how a long curriculum is crossed, so the control stays in reach while it scrolls. -->
	<PageToolbar>
		<Button variant="outline" size="sm" onclick={toggleAll}>
			{#if anyOpen}
				<ChevronsDownUpIcon data-icon="inline-start" />
				{m.curriculum_collapse_all()}
			{:else}
				<ChevronsUpDownIcon data-icon="inline-start" />
				{m.curriculum_expand_all()}
			{/if}
		</Button>
	</PageToolbar>
{/if}

<div class="flex flex-1 flex-col gap-6">
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
			saveOrder({ kind: 'grade' }, data.grades, grades).then(
				(saved) => saved || (grades = data.grades)
			);
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

<DeleteDialog
	bind:this={deleteDialog}
	title={(target: NamedRow) => m.row_delete_title({ name: target.name })}
	description={(target) =>
		target.kind === 'grade'
			? m.curriculum_delete_grade()
			: target.kind === 'subject'
				? m.curriculum_delete_subject()
				: m.curriculum_delete_topic()}
/>
