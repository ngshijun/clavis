<script lang="ts">
	import { mergeProps } from 'bits-ui';
	import type { ComponentProps } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	/**
	 * A button that shows only an icon. Its label is both its accessible name
	 * and its tooltip, so the two can never say different things.
	 */
	let {
		label,
		children,
		size = 'icon-sm',
		...rest
	}: ComponentProps<typeof Button> & { label: string } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button {size} aria-label={label} {...mergeProps(rest, props)}>
				{@render children?.()}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
