<script lang="ts">
	import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
	import TargetIcon from '@lucide/svelte/icons/target';
	import Day from '#lib/components/app/day.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { markFigure } from '#lib/items/run.js';
	import { sessionPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import type { Activity } from '#lib/server/dashboard.js';
	import { cn } from '#lib/utils.js';

	/**
	 * The practice lately finished, newest first. Each opens the session as
	 * its student was shown it; one that did an assignment says so.
	 */
	let {
		activity,
		classroomNames
	}: {
		activity: Activity[];
		/** The names of the classrooms, by id, when the dashboard sums up several. */
		classroomNames: Map<string, string> | undefined;
	} = $props();
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{m.dashboard_activity_title()}</Card.Title>
		<Card.Description>{m.dashboard_activity_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if activity.length === 0}
			<p class="text-muted-foreground">{m.dashboard_practice_empty()}</p>
		{:else}
			<ul class="-mx-2 flex flex-col">
				{#each activity as item (item.sessionId)}
					<li>
						<a
							href={resolvePath(sessionPath(item.classroomId, item.studentId, item.sessionId))}
							class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<span
								class={cn(
									'flex size-8 shrink-0 items-center justify-center rounded-full',
									item.didAssignment
										? 'bg-success/10 text-success'
										: 'bg-accent text-accent-foreground'
								)}
							>
								{#if item.didAssignment}
									<ClipboardCheckIcon
										class="size-4"
										aria-label={m.dashboard_activity_assignment()}
									/>
								{:else}
									<TargetIcon class="size-4" aria-hidden="true" />
								{/if}
							</span>
							<span class="flex min-w-0 flex-1 flex-col leading-tight">
								<span class="truncate">
									<span class="font-medium">{item.studentName}</span>
									{#if classroomNames}
										<span class="text-xs text-muted-foreground">
											· {classroomNames.get(item.classroomId)}
										</span>
									{/if}
								</span>
								<span class="truncate text-xs text-muted-foreground">
									<Day at={item.completedAt} time /> · {item.topicName} · {item.stageName}
								</span>
							</span>
							<span class="font-semibold tabular-nums">
								{markFigure(item.marks)}<span class="font-normal text-muted-foreground"
									>/{item.total}</span
								>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
