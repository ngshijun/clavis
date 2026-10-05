<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import type { Placement } from '#lib/server/curriculum.js';
	import { cn } from '#lib/utils.js';
	import { settle } from './feedback.js';

	/**
	 * Adds a row by typing its name and pressing Enter. The field empties and
	 * keeps the cursor, so a list of names can be typed one after another.
	 */
	let {
		place,
		placeholder,
		label,
		class: className,
		onadded
	}: {
		/** Where the new row goes. */
		place: Placement;
		placeholder: string;
		/** The field's accessible name, which says where the row goes. */
		label: string;
		class?: string;
		onadded?: () => void;
	} = $props();
</script>

<form
	method="POST"
	action="?/add"
	class={className}
	use:enhance={() =>
		async ({ result, formElement }) => {
			if (result.type === 'success') {
				formElement.reset();
				onadded?.();
			}
			await settle(result);
		}}
>
	<input type="hidden" name="kind" value={place.kind} />
	{#if place.kind !== 'grade'}
		<input type="hidden" name="parentId" value={place.parentId} />
	{/if}
	<InputGroup.Root class={cn('border-dashed shadow-none', place.kind === 'topic' && 'h-8')}>
		<InputGroup.Addon>
			<PlusIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			name="name"
			required
			maxlength={120}
			autocomplete="off"
			{placeholder}
			aria-label={label}
		/>
	</InputGroup.Root>
</form>
