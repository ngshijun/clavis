<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { settleForm, type FieldErrors } from '#lib/components/rows/feedback.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import FormRefusal from './form-refusal.svelte';

	/**
	 * A short form in a dialog: what it is for, its fields, and Cancel beside
	 * the button that posts it to a form action of the page it is on. While it
	 * is being saved the buttons wait. Taken, the dialog closes; refused, it
	 * stays open with what was typed, each field saying what is wrong with it
	 * and a sentence above them for whatever no field accounts for.
	 *
	 * Mounted while it is needed and unmounted once it has closed, so every
	 * opening starts afresh.
	 */
	let {
		title,
		description,
		action,
		submit,
		enctype,
		prepare,
		ontaken,
		onclosed,
		fields
	}: {
		title: string;
		description: string;
		/** The form action that answers, as `?/create`. */
		action: string;
		/** What the button that posts the form says. */
		submit: string;
		/** For a form that posts a file. */
		enctype?: 'multipart/form-data';
		/** Adds to what is posted whatever the fields themselves do not carry. */
		prepare?: (form: FormData) => void;
		/**
		 * Called once the form was taken, before the dialog closes. Most forms
		 * need nothing here: what they changed shows on the page behind.
		 */
		ontaken?: () => void;
		onclosed: () => void;
		/** The form's fields, given what the server found wrong with each by its name. */
		fields: Snippet<[FieldErrors]>;
	} = $props();

	let open = $state(true);
	let submitting = $state(false);
	let errors = $state<FieldErrors>({});
	let refusal = $state<string | null>(null);
</script>

<Dialog.Root bind:open onOpenChangeComplete={(isOpen) => !isOpen && onclosed()}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			{action}
			{enctype}
			use:enhance={({ formData }) => {
				submitting = true;
				prepare?.(formData);
				return async ({ result }) => {
					const refused = await settleForm(result);
					submitting = false;
					if (refused) {
						({ errors, message: refusal } = refused);
						return;
					}
					ontaken?.();
					open = false;
				};
			}}
		>
			<Field.FieldGroup>
				<FormRefusal message={refusal} />
				{@render fields(errors)}
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
					{submit}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
