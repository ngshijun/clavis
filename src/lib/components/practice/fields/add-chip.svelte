<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button, type ButtonProps } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { chip } from '../styles.js';

	/**
	 * The dashed chip at the end of a row of chips, which adds one: an empty
	 * place, outlined in dashes, with the word for what goes there.
	 */
	let {
		label,
		invalid = false,
		ref = $bindable(null),
		class: className,
		...rest
	}: ButtonProps & {
		/** The word for what is added: "Answer". */
		label: string;
		/** Marks the chip when the list it adds to is what is wrong. */
		invalid?: boolean;
	} = $props();
</script>

<Button
	bind:ref
	variant="ghost"
	aria-invalid={invalid ? true : undefined}
	class={cn(chip.dashed, className)}
	{...rest}
>
	<PlusIcon data-icon="inline-start" class="size-3" />
	{label}
</Button>
