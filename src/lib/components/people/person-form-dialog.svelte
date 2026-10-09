<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { GradeLevelOption } from '#lib/server/classrooms.js';

	/**
	 * Opens an account: for a student or a teacher of the manager's
	 * organization, or for a manager of the organization an admin has open. A
	 * student signs in with a username and everyone else with an email; either
	 * way whoever opens the account sets the first password and passes it on,
	 * so it is typed in the clear. Mounted while it is needed, so every opening
	 * starts empty. The page it is on answers with the form action `create`.
	 */
	let {
		role,
		gradeLevels = [],
		onclosed
	}: {
		role: 'student' | 'teacher' | 'manager';
		/** The grade levels a student can be in; nobody else has one. */
		gradeLevels?: GradeLevelOption[];
		onclosed: () => void;
	} = $props();

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<Record<string, string[] | undefined>>({});

	let gradeLevelId = $state('');
	const gradeLevel = $derived(gradeLevels.find((grade) => grade.id === gradeLevelId));

	const copies = $derived({
		student: { title: m.person_student_title(), description: m.person_student_description() },
		teacher: { title: m.person_teacher_title(), description: m.person_teacher_description() },
		manager: { title: m.person_manager_title(), description: m.person_manager_description() }
	});
	const copy = $derived(copies[role]);
</script>

{#snippet textField(
	name: string,
	label: string,
	attributes: { type?: string; autocomplete?: 'off' | 'email'; hint?: string } = {}
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

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{copy.title}</Dialog.Title>
			<Dialog.Description>{copy.description}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					submitting = false;
					if (result.type === 'success') {
						// The list itself is the report: the new row appears behind the dialog.
						open = false;
					} else if (result.type === 'failure') {
						errors = (result.data?.errors as typeof errors | undefined) ?? {};
						if (typeof result.data?.message === 'string') toast.error(result.data.message);
					}
				};
			}}
		>
			<Field.FieldGroup>
				{@render textField('name', m.person_name_label())}

				{#if role === 'student'}
					{@render textField('username', m.person_username_label())}

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
				{:else}
					{@render textField('email', m.person_email_label(), { type: 'email' })}
				{/if}

				{@render textField('password', m.person_password_label(), {
					hint: m.person_password_hint()
				})}
			</Field.FieldGroup>

			<Dialog.Footer class="mt-6">
				<Button
					type="button"
					variant="outline"
					disabled={submitting}
					onclick={() => (open = false)}
				>
					{m.action_cancel()}
				</Button>
				<Button type="submit" disabled={submitting}>
					{#if submitting}
						<Spinner data-icon="inline-start" />
					{/if}
					{copy.title}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
