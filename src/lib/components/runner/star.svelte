<script lang="ts">
	import { cn } from '#lib/utils.js';

	/**
	 * One star, drawn as a game draws one: a plump shape raised on a darker
	 * edge, as a stage's button is. One that was earned is gold with a lighter
	 * face; one that was not is an empty socket in grey, so the two differ in
	 * more than colour. It is a picture only: what holds it says the count.
	 */
	let {
		earned,
		ring = false,
		class: className,
		style
	}: {
		earned: boolean;
		/** A rim in the card's colour, to part the star from what it overlaps. */
		ring?: boolean;
		/** Its size: `size-…`. */
		class?: string;
		style?: string;
	} = $props();

	/** Five points with shallow notches, which the round joins of its stroke make plump. */
	const shape =
		'M12 3.7L14.88 8.94L20.75 10.06L16.66 14.41L17.41 20.34L12 17.8L6.59 20.34L7.34 14.41L3.25 10.06L9.12 8.94Z';

	/** How much of the strong border's grey a socket takes, on the card's colour, so it shows in the dark too. */
	const socket = (share: number) =>
		`color-mix(in oklab, var(--border-strong) ${share}%, var(--card))`;
	const edge = $derived(earned ? 'var(--star-edge)' : socket(60));
	const face = $derived(earned ? 'var(--star)' : socket(25));
</script>

<svg
	viewBox="0 0 24 24"
	aria-hidden="true"
	stroke-linejoin="round"
	stroke-width="2.4"
	class={cn('shrink-0 overflow-visible', className)}
	{style}
>
	{#if ring}
		<path d={shape} transform="translate(0 0.65)" class="fill-card stroke-card" stroke-width="6" />
	{/if}
	<path d={shape} transform="translate(0 1.3)" fill={edge} stroke={edge} />
	<path d={shape} fill={face} stroke={face} />
	{#if earned}
		<path
			d={shape}
			transform="translate(12 12.3) scale(0.5) translate(-12 -12.9)"
			fill="color-mix(in oklab, var(--star), white 55%)"
		/>
	{/if}
</svg>
