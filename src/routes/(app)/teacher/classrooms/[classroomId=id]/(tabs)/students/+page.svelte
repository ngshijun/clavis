<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import UsersIcon from '@lucide/svelte/icons/users';
	import Day from '#lib/components/app/day.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { initials } from '#lib/initials.js';
	import { summaryOf } from '#lib/items/progress.js';
	import { studentPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();

	const stages = $derived(data.topics.flatMap((topic) => topic.stages));

	/** What each student has done of the classroom's stages, by the student's id. */
	const summaries = $derived(
		Object.fromEntries(
			data.students.map((student) => [
				student.id,
				summaryOf(stages.map((stage) => data.standings[student.id]?.[stage.id]))
			])
		)
	);
</script>

{#if data.students.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<UsersIcon />
			</Empty.Media>
			<Empty.Description>{m.members_no_students()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<!-- The page's one list, so it stands bare: hairlines between the rows and no box around each. -->
	<Item.Group class="gap-0">
		{#each data.students as student, index (student.id)}
			{@const summary = summaries[student.id]}
			{#if index > 0}
				<Item.Separator class="my-0" />
			{/if}
			<Item.Root class="active:bg-muted">
				{#snippet child({ props })}
					<a href={resolvePath(studentPath(params.classroomId, student.id))} {...props}>
						<Item.Media>
							<Avatar.Root>
								<Avatar.Fallback>{initials(student.name)}</Avatar.Fallback>
							</Avatar.Root>
						</Item.Media>
						<Item.Content class="min-w-0">
							<Item.Title class="truncate">{student.name}</Item.Title>
							{#if student.username}
								<Item.Description class="truncate">{student.username}</Item.Description>
							{/if}
						</Item.Content>
						<Item.Actions>
							<!-- What they have done here, which is what a teacher opens the list to see. -->
							{#if summary.last}
								<span class="grid text-end leading-snug">
									<span class="font-medium tabular-nums">
										{m.progress_stages_of({ done: summary.stages, count: stages.length })} ·
										{m.progress_stars_of({ done: summary.stars, count: stages.length * 3 })}
									</span>
									<span class="text-xs text-muted-foreground">
										{m.progress_last()}
										<Day at={summary.last} />
									</span>
								</span>
							{:else}
								<span class="text-muted-foreground">{m.stars_not_practised()}</span>
							{/if}
							<ChevronRightIcon class="size-4 text-muted-foreground" />
						</Item.Actions>
					</a>
				{/snippet}
			</Item.Root>
		{/each}
	</Item.Group>
{/if}
