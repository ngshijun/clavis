<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { initials } from '#lib/initials.js';
	import { studentPath } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, params }: PageProps = $props();
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
			{#if index > 0}
				<Item.Separator class="my-0" />
			{/if}
			<Item.Root class="active:bg-muted">
				{#snippet child({ props })}
					<a href={resolve(studentPath(params.classroomId, student.id))} {...props}>
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
							<ChevronRightIcon class="size-4 text-muted-foreground" />
						</Item.Actions>
					</a>
				{/snippet}
			</Item.Root>
		{/each}
	</Item.Group>
{/if}
