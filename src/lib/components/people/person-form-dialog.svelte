<script lang="ts">
	import FormDialog from '#lib/components/app/form-dialog.svelte';
	import type { FieldErrors } from '#lib/components/rows/feedback.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { GradeLevelOption } from '#lib/server/classrooms.js';

	/**
	 * Opens an account, or puts right the one given: for a student or a
	 * teacher of the manager's organization, or for a manager of the
	 * organization an admin has open. A student signs in with a username and
	 * everyone else with an email; either way whoever opens the account sets
	 * the first password and passes it on, so it is typed in the clear. What an
	 * account signs in with stays as it was opened, so editing one offers its
	 * name, and a student's grade level. Mounted while it is needed, so every
	 * opening starts afresh. The page it is on answers with the form action
	 * `create`, or `update` for the one given.
	 */
	let {
		role,
		person,
		gradeLevels = [],
		onclosed
	}: {
		role: 'student' | 'teacher' | 'manager';
		/** The person to edit; none to open an account. */
		person?: { id: string; name: string; gradeLevelId?: string | null };
		/** The grade levels a student can be in; nobody else has one. */
		gradeLevels?: GradeLevelOption[];
		onclosed: () => void;
	} = $props();

	// Read once: the dialog is made again for each person it edits.
	// svelte-ignore state_referenced_locally
	let gradeLevelId = $state(person?.gradeLevelId ?? '');
	const gradeLevel = $derived(gradeLevels.find((grade) => grade.id === gradeLevelId));

	const copies = $derived({
		student: {
			add: { title: m.person_student_title(), description: m.person_student_description() },
			edit: { title: m.person_edit_student_title(), description: m.person_edit_username_stays() }
		},
		teacher: {
			add: { title: m.person_teacher_title(), description: m.person_teacher_description() },
			edit: { title: m.person_edit_teacher_title(), description: m.person_edit_email_stays() }
		},
		manager: {
			add: { title: m.person_manager_title(), description: m.person_manager_description() },
			edit: { title: m.person_edit_manager_title(), description: m.person_edit_email_stays() }
		}
	});
	const copy = $derived(copies[role][person ? 'edit' : 'add']);
</script>

{#snippet textField(
	errors: FieldErrors,
	name: string,
	label: string,
	attributes: { type?: string; value?: string; hint?: string } = {}
)}
	{@const { hint, ...input } = attributes}
	<Field.Field data-invalid={errors[name] ? true : undefined}>
		<Field.FieldLabel for="person-{name}">{label}</Field.FieldLabel>
		<Input
			id="person-{name}"
			{name}
			autocomplete="off"
			aria-invalid={errors[name] ? true : undefined}
			{...input}
		/>
		{#if hint}
			<Field.FieldDescription>{hint}</Field.FieldDescription>
		{/if}
		<Field.FieldError errors={errors[name]?.map((message) => ({ message }))} />
	</Field.Field>
{/snippet}

<!-- Taken, the list itself is the report: the row appears, or changes, behind the dialog. -->
<FormDialog
	title={copy.title}
	description={copy.description}
	action={person ? '?/update' : '?/create'}
	submit={person ? m.action_save() : copy.title}
	{onclosed}
>
	{#snippet fields(errors)}
		{#if person}
			<input type="hidden" name="personId" value={person.id} />
		{/if}

		{@render textField(errors, 'name', m.person_name_label(), { value: person?.name })}

		{#if role === 'student'}
			{#if !person}
				{@render textField(errors, 'username', m.person_username_label())}
			{/if}

			<Field.Field data-invalid={errors.gradeLevelId ? true : undefined}>
				<Field.FieldLabel for="person-grade">{m.form_grade_label()}</Field.FieldLabel>
				<Select.Root type="single" name="gradeLevelId" bind:value={gradeLevelId}>
					<Select.Trigger
						id="person-grade"
						class="w-full"
						aria-invalid={errors.gradeLevelId ? true : undefined}
					>
						{gradeLevel?.name ?? m.form_grade_placeholder()}
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each gradeLevels as grade (grade.id)}
								<Select.Item value={grade.id} label={grade.name} />
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
				<Field.FieldError errors={errors.gradeLevelId?.map((message) => ({ message }))} />
			</Field.Field>
		{:else if !person}
			{@render textField(errors, 'email', m.person_email_label(), { type: 'email' })}
		{/if}

		{#if !person}
			{@render textField(errors, 'password', m.person_password_label(), {
				hint: m.person_password_hint()
			})}
		{/if}
	{/snippet}
</FormDialog>
