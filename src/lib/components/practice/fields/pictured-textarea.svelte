<script lang="ts">
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import PictureField from './picture-field.svelte';

	/**
	 * A text and the picture that goes with it, as one field: the picture's
	 * control stands in the field's foot, so it is plain which text it belongs
	 * to and it takes no row of its own.
	 */
	let {
		id,
		value = $bindable(),
		path = $bindable(),
		pictureLabel,
		picture = true,
		invalid = false,
		class: className
	}: {
		id: string;
		value: string;
		/** The `image_path` beside the text: a stored path, `upload:<key>`, or nothing. */
		path?: string | null;
		/** What the picture is of: "Picture for the question". */
		pictureLabel: string;
		/** False for a text that takes no picture here. */
		picture?: boolean;
		invalid?: boolean;
		/** Layout of the text: how tall it is before it grows. */
		class?: string;
	} = $props();
</script>

<!-- The foot pads 8px inside the field's 18px corners, so the picture in it has 10px ones. -->
<InputGroup.Root class="has-data-[align=block-end]:rounded-2xl">
	<InputGroup.Textarea
		{id}
		bind:value
		class={className}
		aria-invalid={invalid ? true : undefined}
	/>
	{#if picture}
		<InputGroup.Addon align="block-end" class="px-2 pb-2">
			<PictureField bind:path label={pictureLabel} />
		</InputGroup.Addon>
	{/if}
</InputGroup.Root>
