<script lang="ts">
	/**
	 * A passage as a pupil gets it: beside each of its questions, in a box that
	 * scrolls when the passage is long. Like the rest of the pupil view it is a
	 * picture of the runner, and draws nothing of a passage not written yet.
	 *
	 * The box has the 10px corners of a box in the pupil view, and its picture,
	 * well inside it, the ladder's smallest.
	 */
	let {
		title,
		body,
		imageUrl
	}: {
		title: string;
		body: string;
		/** Where the passage's picture is shown from; undefined when it has none. */
		imageUrl: string | undefined;
	} = $props();
</script>

{#if title.trim() || body.trim() || imageUrl}
	<div
		class="flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-lg border bg-card px-4 py-3.5 text-base leading-relaxed"
	>
		{#if title.trim()}
			<span class="font-semibold wrap-break-word">{title}</span>
		{/if}
		{#if body.trim()}
			<p class="wrap-break-word whitespace-pre-line">{body}</p>
		{/if}
		{#if imageUrl}
			<img src={imageUrl} alt="" class="max-w-full self-start rounded-sm" />
		{/if}
	</div>
{/if}
