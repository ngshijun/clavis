<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
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

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<Record<string, string[] | undefined>>({});
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.password_reset_title()}</Dialog.Title>
			<Dialog.Description>{m.password_reset_description({ name: person.name })}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/resetPassword"
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					submitting = false;
					if (result.type === 'success') {
						toast.success(m.password_reset_toast({ name: person.name }));
						open = false;
					} else if (result.type === 'failure') {
						errors = (result.data?.errors as typeof errors | undefined) ?? {};
						if (typeof result.data?.message === 'string') toast.error(result.data.message);
					}
				};
			}}
		>
			<input type="hidden" name="personId" value={person.id} />

			<Field.FieldGroup>
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
					{m.password_reset_title()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
