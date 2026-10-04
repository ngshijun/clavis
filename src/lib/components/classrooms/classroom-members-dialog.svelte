<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Classroom, ClassroomStudent, ClassroomTeacher } from '#lib/server/classrooms.js';
	import MemberPickList from './member-pick-list.svelte';

	type Kind = 'students' | 'teachers';

	let {
		classroom,
		students,
		teachers,
		organizationStudents,
		organizationTeachers,
		onclose
	}: {
		classroom: Classroom;
		students: ClassroomStudent[];
		teachers: ClassroomTeacher[];
		/** Everyone in the organization who could be added. */
		organizationStudents: ClassroomStudent[];
		organizationTeachers: ClassroomTeacher[];
		onclose: () => void;
	} = $props();

	let kind = $state<Kind>('students');
	let adding = $state(false);
	let selectedIds = $state<string[]>([]);
	let saving = $state(false);

	const studentDetail = (student: ClassroomStudent) =>
		[student.username, student.gradeLevelName].filter(Boolean).join(' · ') || null;

	const panels = $derived({
		students: {
			icon: UsersIcon,
			tab: m.members_students_tab({ count: students.length }),
			members: students.map((student) => ({ ...student, detail: studentDetail(student) })),
			candidates: organizationStudents.map((student) => ({
				...student,
				detail: studentDetail(student)
			})),
			empty: m.members_no_students(),
			add: m.members_add_students(),
			addSelected: m.members_add_selected_students({ count: selectedIds.length }),
			added: m.members_students_added(),
			remove: m.members_remove_student(),
			removed: m.members_student_removed(),
			search: m.members_student_search(),
			noneFound: m.members_no_students_found()
		},
		teachers: {
			icon: GraduationCapIcon,
			tab: m.members_teachers_tab({ count: teachers.length }),
			members: teachers.map((teacher) => ({ ...teacher, detail: teacher.email })),
			candidates: organizationTeachers.map((teacher) => ({ ...teacher, detail: teacher.email })),
			empty: m.members_no_teachers(),
			add: m.members_add_teachers(),
			addSelected: m.members_add_selected_teachers({ count: selectedIds.length }),
			added: m.members_teachers_added(),
			remove: m.members_remove_teacher(),
			removed: m.members_teacher_removed(),
			search: m.members_teacher_search(),
			noneFound: m.members_no_teachers_found()
		}
	});

	function showMembers() {
		adding = false;
		selectedIds = [];
	}

	/**
	 * Submits a membership change, then reports it once the roster has reloaded.
	 * The forms post back to this dialog's own address (`members` included), so
	 * the submission reloads the roster instead of leaving it.
	 */
	function submit(done: string): SubmitFunction {
		return () => {
			saving = true;
			return async ({ result, update }) => {
				await update();
				saving = false;
				if (result.type === 'success') {
					toast.success(done);
					showMembers();
				} else if (result.type === 'failure' && typeof result.data?.message === 'string') {
					toast.error(result.data.message);
				}
			};
		};
	}
</script>

<Dialog.Root open onOpenChange={(open) => !open && onclose()}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m.members_title({ name: classroom.name })}</Dialog.Title>
			<Dialog.Description>{m.members_description()}</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root
			bind:value={
				() => kind,
				(next) => {
					kind = next === 'teachers' ? 'teachers' : 'students';
					showMembers();
				}
			}
		>
			<Tabs.List class="w-full">
				{#each ['students', 'teachers'] as const as key (key)}
					{@const Icon = panels[key].icon}
					<Tabs.Trigger value={key}>
						<Icon />
						{panels[key].tab}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			{#each ['students', 'teachers'] as const as key (key)}
				{@const panel = panels[key]}
				<Tabs.Content value={key} class="flex flex-col gap-3 pt-2">
					{#if adding}
						<Button
							variant="ghost"
							size="sm"
							class="-ml-2 self-start"
							disabled={saving}
							onclick={showMembers}
						>
							<ArrowLeftIcon data-icon="inline-start" />
							{m.action_back()}
						</Button>

						<MemberPickList
							bind:selectedIds
							members={panel.candidates}
							disabledIds={panel.members.map((member) => member.id)}
							disabledLabel={m.members_already_in()}
							searchPlaceholder={panel.search}
							emptyText={panel.noneFound}
						/>

						<form
							method="POST"
							action="?/addMembers&members={classroom.id}"
							use:enhance={submit(panel.added)}
						>
							<input type="hidden" name="classroomId" value={classroom.id} />
							<input type="hidden" name="kind" value={key} />
							{#each selectedIds as id (id)}
								<input type="hidden" name="ids" value={id} />
							{/each}
							<Button type="submit" class="w-full" disabled={saving || selectedIds.length === 0}>
								{#if saving}
									<Spinner data-icon="inline-start" />
								{/if}
								{panel.addSelected}
							</Button>
						</form>
					{:else}
						<Button size="sm" class="self-end" disabled={saving} onclick={() => (adding = true)}>
							<PlusIcon data-icon="inline-start" />
							{panel.add}
						</Button>

						{#if panel.members.length === 0}
							<Empty.Root class="border border-dashed">
								<Empty.Header>
									<Empty.Media variant="icon">
										<panel.icon />
									</Empty.Media>
									<Empty.Description>{panel.empty}</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						{:else}
							<ScrollArea class="max-h-72">
								<Item.Group class="gap-1">
									{#each panel.members as member (member.id)}
										<Item.Root variant="outline" size="sm">
											<Item.Content class="min-w-0">
												<Item.Title class="truncate">{member.name}</Item.Title>
												{#if member.detail}
													<Item.Description class="truncate text-xs"
														>{member.detail}</Item.Description
													>
												{/if}
											</Item.Content>
											<Item.Actions>
												<form
													method="POST"
													action="?/removeMember&members={classroom.id}"
													use:enhance={submit(panel.removed)}
												>
													<input type="hidden" name="classroomId" value={classroom.id} />
													<input type="hidden" name="kind" value={key} />
													<input type="hidden" name="id" value={member.id} />
													<IconButton
														type="submit"
														variant="ghost"
														class="text-destructive hover:text-destructive"
														disabled={saving}
														label={panel.remove}
													>
														<UserMinusIcon />
													</IconButton>
												</form>
											</Item.Actions>
										</Item.Root>
									{/each}
								</Item.Group>
							</ScrollArea>
						{/if}
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>

		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" disabled={saving} {...props}>{m.action_close()}</Button>
				{/snippet}
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
