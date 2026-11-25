<script lang="ts">
	import { enhance } from '$app/forms';
	import { settle } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { MemberKind } from '#lib/server/classrooms.js';
	import MemberPickList, { type PickableMember } from './member-pick-list.svelte';

	/**
	 * Puts more people on one of a classroom's two lists, for the manager who
	 * keeps it: everyone of the organization who could be on it, to tick. The
	 * page it is on answers with the form action `add`.
	 */
	let {
		open = $bindable(),
		kind,
		memberIds,
		candidates
	}: {
		open: boolean;
		kind: MemberKind;
		/** Who is on the list already, and cannot be put on it again. */
		memberIds: string[];
		/** Everyone of the organization who could be on the list. */
		candidates: PickableMember[];
	} = $props();

	let selectedIds = $state<string[]>([]);
	let saving = $state(false);

	const copy = $derived(
		kind === 'students'
			? {
					title: m.members_add_students(),
					addSelected: m.members_add_selected_students({ count: selectedIds.length }),
					search: m.members_student_search(),
					noneFound: m.members_no_students_found()
				}
			: {
					title: m.members_add_teachers(),
					addSelected: m.members_add_selected_teachers({ count: selectedIds.length }),
					search: m.members_teacher_search(),
					noneFound: m.members_no_teachers_found()
				}
	);
</script>

<Dialog.Root bind:open onOpenChangeComplete={(open) => !open && (selectedIds = [])}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{copy.title}</Dialog.Title>
			<Dialog.Description>{m.members_description()}</Dialog.Description>
		</Dialog.Header>

		<MemberPickList
			bind:selectedIds
			members={candidates}
			disabledIds={memberIds}
			disabledLabel={m.members_already_in()}
			searchPlaceholder={copy.search}
			emptyText={copy.noneFound}
		/>

		<!-- The rows joining the list are the report, so only a refusal is said. -->
		<form
			method="POST"
			action="?/add"
			use:enhance={() => {
				saving = true;
				return async ({ result }) => {
					const added = await settle(result);
					saving = false;
					if (added) open = false;
				};
			}}
		>
			{#each selectedIds as id (id)}
				<input type="hidden" name="ids" value={id} />
			{/each}
			<Dialog.Footer class="mt-6">
				<Button type="button" variant="outline" disabled={saving} onclick={() => (open = false)}>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={saving || selectedIds.length === 0}>
					{#if saving}
						<Spinner data-icon="inline-start" />
					{/if}
					{copy.addSelected}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
