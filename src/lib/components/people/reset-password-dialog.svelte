<script lang="ts">
	import { toast } from 'svelte-sonner';
	import FormDialog from '#lib/components/app/form-dialog.svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Sets a new password for a student or a teacher of the manager's
	 * organization. They cannot change or recover it themselves, so this is the
	 * only way back in for someone who has forgotten theirs. The manager passes
	 * the new one on, so it is typed in the clear. Mounted while it is needed,
	 * so every opening starts empty. The page it is on answers with the form
	 * action `resetPassword`.
	 */
	let {
		person,
		onclosed
	}: {
		person: { id: string; name: string };
		onclosed: () => void;
	} = $props();
</script>

<!-- Nothing on the page changes with a password, so it is said. -->
<FormDialog
	title={m.password_reset_title()}
	description={m.password_reset_description({ name: person.name })}
	action="?/resetPassword"
	submit={m.password_reset_title()}
	ontaken={() => toast.success(m.password_reset_toast({ name: person.name }))}
	{onclosed}
>
	{#snippet fields(errors)}
		<input type="hidden" name="personId" value={person.id} />

		<Field.Field data-invalid={errors.password ? true : undefined}>
			<Field.FieldLabel for="reset-password">{m.password_reset_label()}</Field.FieldLabel>
			<Input
				id="reset-password"
				name="password"
				autocomplete="off"
				aria-invalid={errors.password ? true : undefined}
			/>
			<Field.FieldDescription>{m.person_password_hint()}</Field.FieldDescription>
			<Field.FieldError errors={errors.password?.map((message) => ({ message }))} />
		</Field.Field>
	{/snippet}
</FormDialog>
