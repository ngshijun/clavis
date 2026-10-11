<script lang="ts">
	import { enhance } from '$app/forms';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Day from '#lib/components/app/day.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import StarsRow from '#lib/components/runner/stars.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { initials } from '#lib/initials.js';
	import { isLate } from '#lib/items/assignments.js';
	import { markFigure } from '#lib/items/run.js';
	import { starsOf } from '#lib/items/stars.js';
	import { sessionPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import { cn } from '#lib/utils.js';
	import type { PageProps } from './$types';

	/**
	 * One assignment as its teacher follows it: what was assigned and when,
	 * how many have done it, and every student it was given to. A student
	 * who has done it leads to the practice they scored their best with.
	 *
	 * The list is a 22px card with an 8px inset, so a row has 14px corners.
	 */
	let { data, params }: PageProps = $props();

	const assignment = $derived(data.assignment);
	const done = $derived(data.rows.filter((row) => row.doneAt).length);

	let confirming = $state(false);
	let deleting = $state(false);

	const row = 'flex min-h-14 items-center gap-3 rounded-xl p-2';
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
	<div class="grid min-w-0 flex-[1_1_20rem]">
		<h2 class="text-xl font-semibold wrap-break-word">{data.stage.name}</h2>
		<p class="text-sm text-muted-foreground">
			{data.topic.name} · {m.count_questions({ count: data.stage.questionCount })} ·
			<Day
				at={assignment.assignedAt}
				say={(day) =>
					assignment.assignedBy
						? m.assignment_assigned_by({ day, name: assignment.assignedBy })
						: m.assignment_assigned({ day })}
			/>
		</p>
	</div>
	<Button variant="destructive" onclick={() => (confirming = true)}>
		<Trash2Icon data-icon="inline-start" />
		{m.assignment_delete()}
	</Button>
</div>

<StatStrip
	stats={[
		{ label: m.assignment_done(), value: done, of: data.rows.length },
		{ label: m.assignment_not_done(), value: data.rows.length - done },
		{ label: m.assignment_stat_due(), day: assignment.dueAt ?? undefined }
	]}
/>

{#snippet student(each: (typeof data.rows)[number])}
	<Avatar.Root>
		<Avatar.Fallback>{initials(each.name)}</Avatar.Fallback>
	</Avatar.Root>
	<span class="grid min-w-0 flex-1 leading-snug">
		<span class="truncate font-medium">{each.name}</span>
		<span class="truncate text-xs text-muted-foreground">
			{#if each.doneAt}
				<Day at={each.doneAt} time say={(day) => m.assignment_finished_on({ day })} />
			{:else}
				{m.assignment_not_done()}
			{/if}
		</span>
	</span>
	{#if each.doneAt && isLate(each.doneAt, assignment.dueAt)}
		<Badge variant="outline">{m.assignment_late()}</Badge>
	{/if}
	{#if each.best}
		<span class="font-semibold tabular-nums">
			<span class="sr-only">
				{m.stars_score({ marks: markFigure(each.best.marks), total: each.best.total })}
			</span>
			<span aria-hidden="true">{markFigure(each.best.marks)}/{each.best.total}</span>
		</span>
	{:else}
		<span class="text-muted-foreground" aria-hidden="true">—</span>
	{/if}
	<StarsRow count={each.best ? starsOf(each.best.marks, each.best.total) : 0} />
	<ChevronRightIcon
		class={['size-4 shrink-0 text-muted-foreground', !each.best && 'invisible']}
		aria-hidden="true"
	/>
{/snippet}

<Card.Root class="rounded-3xl p-2">
	<ul aria-label={m.section_students()} class="flex flex-col divide-y">
		{#each data.rows as each (each.id)}
			<li>
				{#if each.best}
					<a
						href={resolvePath(sessionPath(params.classroomId, each.id, each.best.id))}
						class={cn(
							row,
							'outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted'
						)}
					>
						{@render student(each)}
					</a>
				{:else}
					<div class={row}>{@render student(each)}</div>
				{/if}
			</li>
		{/each}
	</ul>
</Card.Root>

<AlertDialog.Root bind:open={confirming}>
	<!-- It opens with the focus on Cancel, as every alert does: a delete is never one Return away. -->
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.assignment_delete_title()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.assignment_delete_description({ stage: data.stage.name })}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				return async ({ result }) => {
					try {
						// Deleted, it leads back to the classroom's overview, where it is no longer listed.
						await settle(result);
					} finally {
						deleting = false;
						confirming = false;
					}
				};
			}}
		>
			<AlertDialog.Footer>
				<AlertDialog.Cancel type="button" disabled={deleting}>
					{m.action_cancel()}
				</AlertDialog.Cancel>
				<!-- Asked for by name and confirmed here, so the plain default button rather than a red one. -->
				<Button type="submit" disabled={deleting}>
					{#if deleting}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.action_delete()}
				</Button>
			</AlertDialog.Footer>
		</form>
	</AlertDialog.Content>
</AlertDialog.Root>
