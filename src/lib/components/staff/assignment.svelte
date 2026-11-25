<script lang="ts">
	import { enhance } from '$app/forms';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import Day from '#lib/components/app/day.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import ListCard from '#lib/components/app/list-card.svelte';
	import PersonRow from '#lib/components/app/person-row.svelte';
	import RecordHeader from '#lib/components/app/record-header.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import { settle } from '#lib/components/rows/feedback.js';
	import Score from '#lib/components/runner/score.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { isLate } from '#lib/items/assignments.js';
	import { sessionPath, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { AssignmentRead } from '#lib/server/staff.js';

	/**
	 * One assignment as the classroom's staff follow it: what was assigned
	 * and when, how many have done it, and every student it was given to. A
	 * student who has done it leads to the practice they scored their best
	 * with. A teacher can delete it, which is rare, so it is in the More
	 * menu; the page it is on answers with the form action `delete`.
	 */
	let { role, data }: { role: StaffRole; data: AssignmentRead & { classroom: Classroom } } =
		$props();

	const deletable = $derived(role === 'teacher');

	const assignment = $derived(data.assignment);
	const done = $derived(data.rows.filter((row) => row.doneAt).length);

	let confirming = $state(false);
	let deleting = $state(false);
</script>

{#snippet menu()}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<IconButton variant="outline" size="icon" label={m.action_more()} {...props}>
					<EllipsisIcon />
				</IconButton>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Group>
				<DropdownMenu.Item variant="destructive" onSelect={() => (confirming = true)}>
					<Trash2Icon />
					{m.menu_delete()}
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<RecordHeader name={data.stage.name} actions={deletable ? menu : undefined}>
	{#snippet detail()}
		{data.topic.name} · {m.count_questions({ count: data.stage.questionCount })} ·
		<Day
			at={assignment.assignedAt}
			say={(day) =>
				assignment.assignedBy
					? m.assignment_assigned_by({ day, name: assignment.assignedBy })
					: m.assignment_assigned({ day })}
		/>
	{/snippet}
</RecordHeader>

<StatStrip
	stats={[
		{ label: m.assignment_done(), value: done, of: data.rows.length },
		{ label: m.assignment_not_done(), value: data.rows.length - done },
		{ label: m.assignment_stat_due(), day: assignment.dueAt ?? undefined }
	]}
/>

<ListCard label={m.section_students()}>
	{#each data.rows as each (each.id)}
		<PersonRow
			name={each.name}
			href={each.best
				? resolvePath(sessionPath(role, data.classroom.id, each.id, each.best.id))
				: undefined}
			holdsChevron
		>
			{#snippet detail()}
				{#if each.doneAt}
					<Day at={each.doneAt} time say={(day) => m.assignment_finished_on({ day })} />
				{:else}
					{m.assignment_not_done()}
				{/if}
			{/snippet}
			{#snippet tail()}
				{#if each.doneAt && isLate(each.doneAt, assignment.dueAt)}
					<Badge variant="outline">{m.assignment_late()}</Badge>
				{/if}
				<Score score={each.best} />
			{/snippet}
		</PersonRow>
	{/each}
</ListCard>

{#if deletable}
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
							if (result.type === 'redirect') {
								toast.success(m.assignment_deleted({ stage: data.stage.name }));
							}
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
{/if}
