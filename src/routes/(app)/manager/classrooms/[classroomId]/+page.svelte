<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const classroom = $derived(data.classroom);
</script>

{#if classroom.archivedAt}
	<Alert.Root class="max-w-2xl">
		<ArchiveIcon />
		<Alert.Description>{m.classroom_archived_note()}</Alert.Description>
	</Alert.Root>
{/if}

<Card.Root class="max-w-2xl gap-0 overflow-hidden py-0">
	{#if classroom.coverUrl}
		<img src={classroom.coverUrl} alt="" class="aspect-3/1 w-full object-cover" />
	{/if}
	<Card.Header class="py-6">
		<Card.Title class="text-xl">{classroom.name}</Card.Title>
		<Card.Description>{classroom.gradeLevelName} · {classroom.subjectName}</Card.Description>
	</Card.Header>
	{#if classroom.counts}
		<Card.Content class="pb-6">
			<div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
				<span class="flex items-center gap-1.5">
					<UsersIcon class="size-4" />
					{m.count_students({ count: classroom.counts.students })}
				</span>
				<span class="flex items-center gap-1.5">
					<GraduationCapIcon class="size-4" />
					{m.count_teachers({ count: classroom.counts.teachers })}
				</span>
			</div>
		</Card.Content>
	{/if}
</Card.Root>
