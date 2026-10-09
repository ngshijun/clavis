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
	 * Creates an organization, or renames the one given. A new one starts with
	 * nothing but its name: its managers are added on its own page. Mounted
	 * while it is needed, so every opening starts afresh. The page it is on
	 * answers with the form action `create`, or `rename` for the one given.
	 */
	let {
		organization,
		onclosed
	}: {
		/** The organization to rename; none to create one. */
		organization?: { name: string };
		onclosed: () => void;
	} = $props();

	const copy = $derived(
		organization
			? {
					title: m.organization_rename_title(),
					description: m.organization_rename_description(),
					submit: m.action_rename()
				}
			: {
					title: m.organization_new_title(),
					description: m.organization_new_description(),
					submit: m.organization_create()
				}
	);

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<Record<string, string[] | undefined>>({});
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{copy.title}</Dialog.Title>
			<Dialog.Description>{copy.description}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action={organization ? '?/rename' : '?/create'}
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
				<Field.Field data-invalid={errors.name ? true : undefined}>
					<Field.FieldLabel for="organization-name">{m.organization_name_label()}</Field.FieldLabel>
					<Input
						id="organization-name"
						name="name"
						autocomplete="off"
						value={organization?.name ?? ''}
						aria-invalid={errors.name ? true : undefined}
					/>
					<Field.FieldError errors={errors.name?.map((message) => ({ message }))} />
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
					{copy.submit}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
