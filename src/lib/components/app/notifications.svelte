<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import BellIcon from '@lucide/svelte/icons/bell';
	import { settle } from '#lib/components/rows/feedback.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { initials } from '#lib/initials.js';
	import { markFigure } from '#lib/items/run.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Notifications } from '#lib/server/assignments.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import { cn } from '#lib/utils.js';
	import Day from './day.svelte';

	/**
	 * A teacher's notifications, behind a bell that carries how many they
	 * have not seen: one for each student who has done something the teacher
	 * assigned. Pressing one opens its assignment and marks what the teacher
	 * was told of that assignment as seen. They are read when a page loads.
	 *
	 * A 22px popover with an 8px inset, so a row has 14px corners.
	 */
	let {
		notifications,
		classrooms
	}: {
		notifications: Notifications;
		/** The teacher's classrooms, to name the one a notification is from. */
		classrooms: Classroom[];
	} = $props();

	let open = $state(false);

	// The teacher's home owns the two actions, wherever the bell is pressed from.
	const home = resolve('teacher');
	const classroomName = (id: string) => classrooms.find((classroom) => classroom.id === id)?.name;
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<!-- The trigger's own attributes first: they carry no class, and would take this one away. -->
			<Button
				{...props}
				variant="ghost"
				size="icon"
				class="relative"
				aria-label={m.notifications_open({ count: notifications.unread })}
			>
				<BellIcon />
				{#if notifications.unread > 0}
					<span
						aria-hidden="true"
						class="absolute -end-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-xs leading-none font-bold text-destructive-foreground tabular-nums ring-2 ring-background"
					>
						{notifications.unread}
					</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[min(26rem,calc(100vw-2rem))] gap-1 p-2">
		<div class="flex min-h-9 items-center justify-between gap-3 ps-2">
			<Popover.Title class="font-semibold">{m.notifications_title()}</Popover.Title>
			{#if notifications.unread > 0}
				<form
					method="POST"
					action="{home}?/readNotifications"
					use:enhance={() =>
						async ({ result }) => {
							await settle(result);
						}}
				>
					<Button type="submit" variant="ghost" size="sm" class="text-primary">
						{m.notifications_mark_all()}
					</Button>
				</form>
			{/if}
		</div>

		{#if notifications.latest.length === 0}
			<Empty.Root class="p-6">
				<Empty.Header>
					<Empty.Media variant="icon">
						<BellIcon />
					</Empty.Media>
					<Empty.Title class="text-base">{m.notifications_none()}</Empty.Title>
					<Empty.Description>{m.notifications_none_description()}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<ul class="flex max-h-[min(28rem,60svh)] flex-col gap-1 overflow-y-auto">
				{#each notifications.latest as notice (notice.assignmentId + notice.studentId)}
					<li>
						<form
							method="POST"
							action="{home}?/openNotification"
							use:enhance={() =>
								async ({ result }) => {
									open = false;
									await settle(result);
								}}
						>
							<input type="hidden" name="classroomId" value={notice.classroomId} />
							<input type="hidden" name="assignmentId" value={notice.assignmentId} />
							<button
								type="submit"
								class={cn(
									'flex w-full items-start gap-3 rounded-xl p-2 text-start outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
									!notice.seen && 'bg-accent hover:bg-accent/70'
								)}
							>
								<Avatar.Root>
									<Avatar.Fallback>{initials(notice.studentName)}</Avatar.Fallback>
								</Avatar.Root>
								<span class="grid min-w-0 flex-1 gap-0.5 leading-snug">
									<span class="wrap-break-word">
										<span class="font-semibold">{notice.studentName}</span>
										{m.notification_finished()}
										<span class="font-semibold">{notice.stageName}</span>
									</span>
									<span class="text-xs text-muted-foreground">
										{markFigure(notice.marks)}/{notice.total} ·
										{classroomName(notice.classroomId)} ·
										<Day at={notice.doneAt} />
									</span>
								</span>
								{#if !notice.seen}
									<span class="mt-2 size-2 shrink-0 rounded-full bg-primary">
										<span class="sr-only">{m.notification_unread()}</span>
									</span>
								{/if}
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>
