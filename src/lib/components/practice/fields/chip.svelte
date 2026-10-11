<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';
	import { chip } from '../styles.js';

	/**
	 * One word or phrase in a row of them: an answer, an extra word, a learning
	 * point. Set them in a `chips` row. A chip that is pressed is a button, and
	 * takes its look from `chip` in the same way.
	 */
	let {
		tone = 'plain',
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & {
		/** `key` for an answer, `plain` for a word that is not one. */
		tone?: 'plain' | 'key';
		children: Snippet;
	} = $props();
</script>

<Badge class={cn(chip[tone], className)} {...rest}>
	{@render children()}
</Badge>
