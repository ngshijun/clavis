<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import { m } from '#lib/paraglide/messages.js';
	import { cn } from '#lib/utils.js';
	import type { Verdict } from './marks.js';

	/**
	 * The tick or the cross on a part of an answer that was marked. It says in
	 * words, to a reader that cannot see it, what its colour and shape say.
	 */
	let { verdict, class: className }: { verdict: Verdict; class?: string } = $props();
</script>

<span
	class={cn(
		'inline-flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:size-3 [&_svg]:stroke-[3.5]',
		verdict === 'right'
			? 'bg-success text-success-foreground'
			: 'bg-destructive text-destructive-foreground',
		className
	)}
>
	{#if verdict === 'right'}
		<CheckIcon aria-hidden="true" />
		<span class="sr-only">{m.run_mark_full()}</span>
	{:else}
		<XIcon aria-hidden="true" />
		<span class="sr-only">{m.run_mark_none()}</span>
	{/if}
</span>
