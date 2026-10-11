<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import WrenchIcon from '@lucide/svelte/icons/wrench';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { DEV_ACCOUNTS } from '#lib/dev-accounts.js';

	/**
	 * Developer-only switches, rendered by the root layout on the dev server
	 * only. So far there is one: signing in as any of the seeded test accounts
	 * without going through the sign-in page.
	 */
	const current = $derived(page.data.user?.email ?? '');

	let form: HTMLFormElement;
	let field: HTMLInputElement;

	function signInAs(email: string) {
		if (email === current) return;
		field.value = email;
		form.requestSubmit();
	}
</script>

<form bind:this={form} method="POST" action={resolve('dev/sign-in')} hidden>
	<input bind:this={field} type="hidden" name="email" />
</form>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<!-- Above where a page keeps a bar along its bottom, so it covers no button there. -->
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				class="fixed end-4 bottom-20 z-50 rounded-full shadow-md"
				aria-label="Developer Tools"
			>
				<WrenchIcon />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" side="top" sideOffset={8} class="min-w-56">
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading>Sign In As</DropdownMenu.GroupHeading>
			<DropdownMenu.RadioGroup value={current} onValueChange={signInAs}>
				{#each DEV_ACCOUNTS as account (account.email)}
					<DropdownMenu.RadioItem value={account.email}>
						<span class="grid gap-0.5">
							<span>{account.name}</span>
							<span class="text-xs text-muted-foreground">
								<span class="capitalize">{account.role}</span> · {account.note}
							</span>
						</span>
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
