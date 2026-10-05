<script lang="ts">
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { postAction } from '#lib/form-actions.js';
	import { optimizeImage } from '#lib/image.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { CoveredKind } from '#lib/server/curriculum.js';
	import { settle } from './feedback.js';

	/**
	 * A subject's or a topic's cover, as a thumbnail that is also the control
	 * for changing it. A dashed square marks a row that has no cover yet, so
	 * the ones still missing can be seen at a glance.
	 */
	let {
		kind,
		id,
		name,
		coverUrl
	}: { kind: CoveredKind; id: string; name: string; coverUrl: string | null } = $props();

	let picker = $state<HTMLInputElement>();
	let busy = $state(false);

	/** Saves `file` as the cover, or removes the cover when there is no file. */
	async function save(file: File | null) {
		const form = new FormData();
		form.set('kind', kind);
		form.set('id', id);
		if (file) form.set('cover', file);
		else form.set('remove', 'true');

		busy = true;
		await settle(await postAction('?/cover', form));
		busy = false;
	}

	async function pick(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		// Emptied, so picking the same file again is still a change.
		event.currentTarget.value = '';
		if (!file) return;

		let optimized: File;
		try {
			optimized = await optimizeImage(file);
		} catch {
			// A file the browser cannot decode, such as a HEIC photo or a damaged image.
			toast.error(m.curriculum_cover_invalid());
			return;
		}
		await save(optimized);
	}
</script>

<input
	bind:this={picker}
	type="file"
	accept="image/png,image/jpeg,image/webp,image/gif"
	hidden
	onchange={pick}
/>

{#if busy}
	<span class="flex size-8 shrink-0 items-center justify-center">
		<Spinner />
	</span>
{:else if coverUrl}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					variant="ghost"
					size="icon-sm"
					class="shrink-0 p-1"
					aria-label={m.curriculum_cover_of({ name })}
					{...props}
				>
					<img src={coverUrl} alt="" class="size-full rounded-sm object-cover" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			<DropdownMenu.Group>
				<DropdownMenu.Item onSelect={() => picker?.click()}>
					<ImageUpIcon />
					{m.curriculum_cover_replace()}
				</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onSelect={() => save(null)}>
					<Trash2Icon />
					{m.curriculum_cover_remove()}
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<IconButton
		variant="ghost"
		label={m.curriculum_cover_add()}
		class="shrink-0 text-muted-foreground"
		onclick={() => picker?.click()}
	>
		<span class="flex size-6 items-center justify-center rounded-sm border border-dashed">
			<ImagePlusIcon class="size-3.5" />
		</span>
	</IconButton>
{/if}
