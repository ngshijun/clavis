<script lang="ts">
	import { enhance } from '$app/forms';
	import logo from '#lib/assets/logo.svg';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>{m.login_title()} · Clavis</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<div class="mb-1 flex items-center justify-center gap-3">
				<img src={logo} alt={m.logo_alt()} class="size-10" />
				<span class="translate-y-1 font-logo text-3xl text-primary">Clavis</span>
			</div>
			<Card.Title class="text-xl">{m.login_title()}</Card.Title>
			<Card.Description>{m.login_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<Field.FieldGroup>
					<Field.Field data-invalid={form?.message ? true : undefined}>
						<Field.FieldLabel for="email">{m.login_email()}</Field.FieldLabel>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="username"
							required
							value={form?.email ?? ''}
							placeholder={m.login_email_placeholder()}
							aria-invalid={form?.message ? true : undefined}
						/>
					</Field.Field>
					<Field.Field data-invalid={form?.message ? true : undefined}>
						<Field.FieldLabel for="password">{m.login_password()}</Field.FieldLabel>
						<Input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
							aria-invalid={form?.message ? true : undefined}
						/>
						{#if form?.message}
							<Field.FieldError>{form.message}</Field.FieldError>
						{/if}
					</Field.Field>
					<Button type="submit" class="w-full" disabled={submitting}>
						{#if submitting}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.login_submit()}
					</Button>
				</Field.FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</div>
