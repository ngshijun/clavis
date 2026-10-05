<script lang="ts">
	import { flip } from 'svelte/animate';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { dragHandleZone } from 'svelte-dnd-action';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { GradeLevel } from '#lib/server/curriculum.js';
	import { cn } from '#lib/utils.js';
	import AddField from './add-field.svelte';
	import DragHandle from './drag-handle.svelte';
	import InlineName from './inline-name.svelte';
	import { FLIP_MS, saveOrder } from './reorder.js';
	import RowDelete from './row-delete.svelte';
	import SubjectCard from './subject-card.svelte';

	/** One grade level: a heading row, and beneath it the grade's subjects side by side. */
	let { grade, open = $bindable(true) }: { grade: GradeLevel; open?: boolean } = $props();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let subjects = $derived(grade.subjects);

	const summary = $derived(
		[
			m.count_subjects({ count: grade.subjects.length }),
			m.count_topics({
				count: grade.subjects.reduce((sum, subject) => sum + subject.topics.length, 0)
			})
		].join(' · ')
	);
</script>

<Collapsible.Root bind:open class="flex flex-col gap-3">
	<div class="group/row flex flex-wrap items-center gap-x-1 gap-y-2 border-b pb-2">
		<DragHandle label={m.curriculum_reorder({ name: grade.name })} />
		<h2 class="flex min-w-0">
			<InlineName kind="grade" id={grade.id} name={grade.name} textClass="text-lg font-semibold" />
		</h2>
		<span class="text-sm text-muted-foreground">{summary}</span>
		<div class="ml-auto flex items-center gap-1">
			<AddField
				place={{ kind: 'subject', parentId: grade.id }}
				placeholder={m.curriculum_add_subject()}
				label={m.curriculum_add_subject_to({ name: grade.name })}
				class="w-44"
				onadded={() => (open = true)}
			/>
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<IconButton
						variant="ghost"
						label={open
							? m.curriculum_collapse({ name: grade.name })
							: m.curriculum_expand({ name: grade.name })}
						{...props}
					>
						<ChevronDownIcon class={cn('transition-transform', !open && '-rotate-90')} />
					</IconButton>
				{/snippet}
			</Collapsible.Trigger>
			<RowDelete target={{ kind: 'grade', id: grade.id, name: grade.name }} />
		</div>
	</div>

	<Collapsible.Content class="flex flex-col gap-3">
		{#if subjects.length === 0}
			<p class="text-sm text-muted-foreground">{m.curriculum_no_subjects()}</p>
		{/if}
		<div
			aria-label={m.curriculum_subjects_of({ name: grade.name })}
			class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] items-start gap-3"
			use:dragHandleZone={{
				items: subjects,
				type: `subjects:${grade.id}`,
				flipDurationMs: FLIP_MS,
				dropTargetStyle: {}
			}}
			onconsider={(event) => (subjects = event.detail.items)}
			onfinalize={(event) => {
				subjects = event.detail.items;
				saveOrder({ kind: 'subject', parentId: grade.id }, grade.subjects, subjects);
			}}
		>
			{#each subjects as subject (subject.id)}
				<div aria-label={subject.name} animate:flip={{ duration: FLIP_MS }}>
					<SubjectCard {subject} />
				</div>
			{/each}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
