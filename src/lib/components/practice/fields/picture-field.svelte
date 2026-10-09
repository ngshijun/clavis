<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import ImageUpIcon from '@lucide/svelte/icons/image-up';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import IconButton from '#lib/components/app/icon-button.svelte';
	import PicturePicker from '#lib/components/app/picture-picker.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import { getEditor } from '../editor.svelte.js';

	/**
	 * An optional picture: of the question, of an option, of an item. Picking
	 * one shows it at once and holds the file in the page; it is uploaded when
	 * the question is saved.
	 */
	let {
		path = $bindable(),
		label,
		size = 'field',
		invalid = false
	}: {
		/** The payload's `image_path`: a stored path, `upload:<key>`, or nothing. */
		path: string | null | undefined;
		/** What the picture is of: "Picture for option B". Names the control when it shows no words. */
		label: string;
		/**
		 * `field`: a button with words and the picture large beneath it, for a
		 * field of its own. `row`: an icon that becomes a thumbnail, for a row.
		 * `chip`: the same, round and small enough to sit inside a chip.
		 */
		size?: 'field' | 'row' | 'chip';
		invalid?: boolean;
	} = $props();

	const editor = getEditor();
	const url = $derived(editor.imageUrl(path));

	let picker = $state<PicturePicker>();

	/** The thumbnail's button and the picture in it: a 4px inset, so the picture's corners are one rung in. */
	const thumb = $derived(
		size === 'chip'
			? { button: 'size-6 rounded-full p-0.5', picture: 'rounded-full' }
			: { button: 'rounded-lg p-1', picture: 'rounded-sm' }
	);
</script>

<PicturePicker bind:this={picker} onpick={(picture) => (path = editor.addImage(picture))} />

{#if size !== 'field'}
	{#if url}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						variant="ghost"
						size="icon-sm"
						class={cn('shrink-0', thumb.button)}
						aria-label={label}
						{...props}
					>
						<img src={url} alt="" class={cn('size-full object-cover', thumb.picture)} />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				<DropdownMenu.Group>
					<DropdownMenu.Item onSelect={() => picker?.open()}>
						<ImageUpIcon />
						{m.image_replace()}
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onSelect={() => (path = undefined)}>
						<Trash2Icon />
						{m.image_remove()}
					</DropdownMenu.Item>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		<IconButton
			variant="ghost"
			size={size === 'chip' ? 'icon-xs' : 'icon-sm'}
			{label}
			class="shrink-0 text-muted-foreground"
			aria-invalid={invalid ? true : undefined}
			onclick={() => picker?.open()}
		>
			<ImageIcon />
		</IconButton>
	{/if}
{:else if url}
	<div class="flex flex-col items-start gap-1">
		<img src={url} alt={label} class="max-h-40 max-w-full rounded-xl border bg-card" />
		<div class="flex flex-wrap gap-1">
			<Button variant="ghost" size="sm" onclick={() => picker?.open()}>
				<ImageUpIcon data-icon="inline-start" />
				{m.image_replace()}
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (path = undefined)}>
				<Trash2Icon data-icon="inline-start" />
				{m.image_remove()}
			</Button>
		</div>
	</div>
{:else}
	<div>
		<Button
			variant="ghost"
			size="sm"
			aria-invalid={invalid ? true : undefined}
			onclick={() => picker?.open()}
		>
			<ImageIcon data-icon="inline-start" />
			{m.practice_image_add()}
		</Button>
	</div>
{/if}
