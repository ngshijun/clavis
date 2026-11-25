<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import Day from '#lib/components/app/day.svelte';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import RecordHeader from '#lib/components/app/record-header.svelte';
	import StatStrip from '#lib/components/app/stat-strip.svelte';
	import RemoveMemberDialog from '#lib/components/classrooms/remove-member-dialog.svelte';
	import TopicStages from '#lib/components/progress/topic-stages.svelte';
	import Score from '#lib/components/runner/score.svelte';
	import StageDialog from '#lib/components/runner/stage-dialog.svelte';
	import type { Stop } from '#lib/components/runner/stage-path.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { standingOf, summaryOf } from '#lib/items/progress.js';
	import { sessionPath, type StaffRole } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { StudentRead } from '#lib/server/staff.js';

	/**
	 * One student's practice in a classroom, as its staff follow it: what
	 * it comes to, then every stage with where they stand on it. A stage they
	 * have practised opens the dialog they are shown before a run, and each
	 * attempt in it leads to that practice as the student was shown it marked.
	 *
	 * A manager, who keeps the roster, takes the student out of the classroom
	 * from here, while it is live. That is rare, so it is in the More menu,
	 * and it asks first; the page it is on answers with the form action
	 * `remove`.
	 */
	let { role, data }: { role: StaffRole; data: StudentRead & { classroom: Classroom } } = $props();

	const student = $derived(data.student);
	const detail = $derived(
		[student.username, student.gradeLevelName].filter((part) => part !== null).join(' · ')
	);
	const removable = $derived(role === 'manager' && data.classroom.archivedAt === null);
	let removing = $state(false);

	const stages = $derived(data.topics.flatMap((topic) => topic.stages));
	/** Where the student stands on each stage they have practised, by the stage's id. */
	const standings = $derived(
		Object.fromEntries(stages.map((stage) => [stage.id, standingOf(data.attempts[stage.id] ?? [])]))
	);
	const summary = $derived(summaryOf(stages.map((stage) => standings[stage.id])));

	// The stage whose dialog is open. It is kept when the dialog closes, so the dialog
	// does not go blank while it fades.
	let picked = $state<Stop>();
	let open = $state(false);
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
				<DropdownMenu.Item variant="destructive" onSelect={() => (removing = true)}>
					<UserMinusIcon />
					{m.menu_remove_from_classroom()}
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<RecordHeader avatar name={student.name} {detail} actions={removable ? menu : undefined} />

<StatStrip
	stats={[
		{ label: m.progress_stat_stages(), value: summary.stages, of: stages.length },
		{ label: m.progress_stat_stars(), value: summary.stars, of: stages.length * 3 },
		{ label: m.progress_stat_sessions(), value: summary.sessions },
		{ label: m.progress_last(), day: summary.last }
	]}
/>

{#each data.topics as topic (topic.id)}
	<TopicStages
		{topic}
		pickable={(stage) => standings[stage.id] !== undefined}
		onpick={(stop) => {
			picked = stop;
			open = true;
		}}
	>
		{#snippet tail(stage)}
			{@const standing = standings[stage.id]}
			{#if standing}
				<Score score={standing.best} />
				<span class="w-24 text-end text-muted-foreground tabular-nums max-sm:hidden">
					{m.count_attempts({ count: standing.attempts })}
				</span>
				<Day
					at={standing.last}
					class="inline-block w-24 text-end text-muted-foreground first-letter:uppercase"
				/>
			{:else}
				<span class="text-muted-foreground">{m.stars_not_practised()}</span>
			{/if}
		{/snippet}
	</TopicStages>
{/each}

{#if picked}
	<StageDialog
		bind:open
		stop={picked}
		attempts={data.attempts[picked.stage.id] ?? []}
		attemptHref={(attempt) =>
			resolvePath(sessionPath(role, data.classroom.id, student.id, attempt.id))}
	/>
{/if}

{#if removable}
	<RemoveMemberDialog
		bind:open={removing}
		kind="students"
		member={student}
		classroom={data.classroom}
	/>
{/if}
