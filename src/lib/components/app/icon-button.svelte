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
		type,
		...rest
	}: ComponentProps<typeof Button> & { label: string } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- The tooltip's trigger says `type="button"`, which would stop a button meant to submit its form. -->
			<Button {size} aria-label={label} {...mergeProps(rest, props, { type: type ?? 'button' })}>
				{@render children?.()}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
