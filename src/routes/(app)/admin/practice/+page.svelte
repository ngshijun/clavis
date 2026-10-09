<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TargetIcon from '@lucide/svelte/icons/target';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import Segmented from '#lib/components/app/segmented.svelte';
	import { coverGrid } from '#lib/components/app/cover-card.svelte';
	import SubjectCard from '#lib/components/practice/subject-card.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { practiceGradeHref, practiceSubjectPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	/**
	 * Practice starts from a subject, one grade level at a time: the grade
	 * level is chosen in the toolbar and its subjects are the cards beneath.
	 */
	let { data }: PageProps = $props();

	/**
	 * The grade level in the address, so that a reload and a link both come
	 * back to it; the first one when the address names none, or one that is gone.
	 */
	const grade = $derived(
		data.grades.find((item) => item.id === page.url.searchParams.get('grade')) ?? data.grades[0]
	);

	/**
	 * Brings the chosen grade level into view where the row of them is wider
	 * than the screen. It runs again whenever another one is chosen.
	 */
	function reveal(row: HTMLElement) {
		row
			.querySelector(`[data-value="${grade.id}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
</script>

{#if !grade}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<TargetIcon />
			</Empty.Media>
			<Empty.Title>{m.practice_empty_title()}</Empty.Title>
			<Empty.Description>{m.practice_empty_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<PageToolbar>
		<!--
			On a narrow screen the grade levels do not fit in one row, and the row is
			scrolled sideways. The padding is room for the focus ring, which the
			scrolling would otherwise clip.
		-->
		<div
			class="-m-1 me-auto max-w-full [scrollbar-width:none] overflow-x-auto p-1"
			{@attach reveal}
		>
			<!-- Choosing a grade level is not a new page: the focus and the scroll stay where they are. -->
			<Segmented
				bind:value={() => grade.id, (id) => goto(practiceGradeHref(id), { reset: false })}
				options={data.grades.map(({ id, name }) => ({ value: id, label: name }))}
				label={m.form_grade_label()}
				class="w-max"
			/>
		</div>
	</PageToolbar>

	{#if grade.subjects.length === 0}
		<p class="text-sm text-muted-foreground">{m.curriculum_no_subjects()}</p>
	{:else}
		<ul aria-label={m.practice_subjects_of({ name: grade.name })} class={coverGrid}>
			{#each grade.subjects as subject (subject.id)}
				<li>
					<SubjectCard
						{subject}
						gradeName={grade.name}
						href={resolvePath(practiceSubjectPath(subject.id))}
					/>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
