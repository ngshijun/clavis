<script lang="ts" generics="Value extends string">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A choice between two or three things that are all in view: one is always
	 * chosen, and choosing another replaces it.
	 */
	let {
		value = $bindable(),
		options,
		label,
		class: className
	}: {
		value: Value;
		options: readonly { value: Value; label: string }[];
		/** What is being chosen: the group's accessible name. */
		label: string;
		class?: string;
	} = $props();
</script>

<ToggleGroup.Root
	type="single"
	spacing={0.5}
	aria-label={label}
	class={cn('rounded-4xl bg-muted p-0.5', className)}
	bind:value={
		() => value,
		(next) => {
			// Pressing the chosen one again would choose nothing, and one is always chosen.
			if (next) value = next as Value;
		}
	}
>
	{#each options as option (option.value)}
		<ToggleGroup.Item
			value={option.value}
			class="h-7 min-w-0 rounded-4xl px-3 text-muted-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
		>
			{option.label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
