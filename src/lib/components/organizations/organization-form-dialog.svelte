<script lang="ts">
	import FormDialog from '#lib/components/app/form-dialog.svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
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
</script>

<!-- Taken, the list itself is the report: the new row appears behind the dialog. -->
<FormDialog
	title={copy.title}
	description={copy.description}
	action={organization ? '?/rename' : '?/create'}
	submit={copy.submit}
	{onclosed}
>
	{#snippet fields(errors)}
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
	{/snippet}
</FormDialog>
