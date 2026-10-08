<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { settle } from './feedback.js';

	/**
	 * A row's name, renamed where it stands: click it, type, and Enter or
	 * clicking away saves. Escape, or leaving it empty or unchanged, puts the
	 * old name back.
	 */
	let {
		kind,
		id,
		name,
		class: className,
		textClass
	}: {
		kind: string;
		id: string;
		name: string;
		/** Layout: how the name sits among its neighbours. */
		class?: string;
		/** Type: how the name reads, the same whether shown or being typed. */
		textClass?: string;
	} = $props();

	let editing = $state(false);
	let saving = $state(false);
	let form = $state<HTMLFormElement>();
	let button = $state<HTMLElement | null>(null);
	/** Whether the save under way was started by leaving the field rather than by Enter. */
	let left = false;

	/**
	 * Shows the name again. When the keyboard ended the edit, the focus goes back
	 * to the name, where it was before; when a click elsewhere did, it stays there.
	 */
	async function close(refocus: boolean) {
		editing = false;
		if (!refocus) return;
		await tick();
		button?.focus();
	}

	function focus(input: HTMLInputElement) {
		input.focus();
		input.select();
	}

	/** Whether what was typed is a new name worth saving. */
	function changed(value: FormDataEntryValue | null) {
		const typed = String(value ?? '').trim();
		return typed !== '' && typed !== name;
	}
</script>

{#if editing}
	<form
		bind:this={form}
		method="POST"
		action="?/rename"
		class={cn('min-w-0', className)}
		use:enhance={({ formData, cancel }) => {
			if (!changed(formData.get('name'))) {
				close(true);
				cancel();
				return;
			}
			saving = true;
			return async ({ result }) => {
				try {
					await settle(result);
				} finally {
					saving = false;
					close(!left);
				}
			};
		}}
	>
		<input type="hidden" name="kind" value={kind} />
		<input type="hidden" name="id" value={id} />
		<Input
			name="name"
			value={name}
			required
			maxlength={120}
			autocomplete="off"
			readonly={saving}
			aria-label={m.row_name_label()}
			class={cn('h-8 rounded-lg px-2', textClass)}
			onblur={(event) => {
				// The field also loses focus when it is taken away, after a save or a cancel.
				if (!editing || saving) return;
				left = true;
				if (changed(event.currentTarget.value)) form?.requestSubmit();
				else close(false);
			}}
			onkeydown={(event) => {
				if (event.key === 'Escape') close(true);
			}}
			{@attach focus}
		/>
	</form>
{:else}
	<Button
		bind:ref={button}
		variant="ghost"
		title={m.action_rename()}
		class={cn(
			'h-auto min-h-8 min-w-0 cursor-text justify-start rounded-lg px-2 py-1 text-start whitespace-normal',
			className,
			textClass
		)}
		onclick={() => {
			left = false;
			editing = true;
		}}
	>
		{name}
	</Button>
{/if}
