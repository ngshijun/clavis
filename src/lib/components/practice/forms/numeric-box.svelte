<script lang="ts">
	import { untrack } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A box for one number of a Number question's answer. It holds what was
	 * typed as text and reads the number from it, so a box that is empty or does
	 * not read as a number is NaN in the payload and never 0: the schema then
	 * asks for the number, where a 0 would be saved as an answer.
	 */
	let {
		value = $bindable(),
		label,
		whole = false,
		optional = false,
		format = String,
		invalid = false,
		placeholder,
		class: className
	}: {
		/** NaN while there is no number in the box. */
		value: number | null | undefined;
		/** What the number is: "Numerator". The box shows no words of its own. */
		label: string;
		/** A whole number is asked for, so a phone offers its digits without the point. */
		whole?: boolean;
		/** An empty box then means the value is left out, and writes `undefined`. */
		optional?: boolean;
		/** How a stored number is written when the box first shows it. */
		format?: (value: number) => string;
		invalid?: boolean;
		placeholder?: string;
		class?: string;
	} = $props();

	// What is in the box. It is made from the number once and is then the person's own typing:
	// writing the number back out would undo a "1." or a "19.20" as it is typed.
	let typed = $state(
		untrack(() => (typeof value === 'number' && !Number.isNaN(value) ? format(value) : ''))
	);

	function read(text: string) {
		typed = text;
		const entry = text.trim();
		if (entry) value = Number(entry);
		else value = optional ? undefined : NaN;
	}
</script>

<Input
	bind:value={() => typed, read}
	inputmode={whole ? 'numeric' : 'decimal'}
	autocomplete="off"
	aria-label={label}
	aria-invalid={invalid ? true : undefined}
	{placeholder}
	class={cn('w-16 shrink-0 rounded-lg px-2 text-center tabular-nums', className)}
/>
