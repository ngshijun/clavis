<script lang="ts">
	import FormattedEditor from '#lib/components/formatted/formatted-editor.svelte';
	import PictureField from './picture-field.svelte';

	/**
	 * A formatted text and the picture that goes with it, as one field: the
	 * picture's control stands in the field's foot, so it is plain which text
	 * it belongs to and it takes no row of its own.
	 */
	let {
		id,
		value = $bindable(),
		path = $bindable(),
		label,
		pictureLabel,
		picture = true,
		invalid = false,
		textClass
	}: {
		id: string;
		/** The text as HTML. */
		value: string;
		/** The `image_path` beside the text: a stored path, `upload:<key>`, or nothing. */
		path?: string | null;
		/** What the text is: "Question". */
		label: string;
		/** What the picture is of: "Picture for the question". */
		pictureLabel: string;
		/** False for a text that takes no picture here. */
		picture?: boolean;
		invalid?: boolean;
		/** How tall the text is before it grows. */
		textClass?: string;
	} = $props();
</script>

<!-- The foot pads 8px inside the field's 18px corners, so the picture in it has 10px ones. -->
<FormattedEditor
	{id}
	bind:value
	{label}
	{invalid}
	{textClass}
	foot={picture ? pictureFoot : undefined}
/>

{#snippet pictureFoot()}
	<PictureField bind:path label={pictureLabel} />
{/snippet}
