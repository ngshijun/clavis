<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { initials } from '#lib/initials.js';
	import ListRow from './list-row.svelte';

	/**
	 * A person's row in a list: their initials where a picture would be, their
	 * name, a line about them, and what the list has to say of them at the end.
	 * A student's line is "username · grade" wherever both are known.
	 */
	let { name, ...row }: { name: string } & Omit<ComponentProps<typeof ListRow>, 'title' | 'lead'> =
		$props();
</script>

<ListRow title={name} {...row}>
	{#snippet lead()}
		<Avatar.Root>
			<Avatar.Fallback>{initials(name)}</Avatar.Fallback>
		</Avatar.Root>
	{/snippet}
</ListRow>
