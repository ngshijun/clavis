<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { IMAGE_ACCEPT, preparePicture } from '#lib/image.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Picks a picture from the person's files. It draws nothing: whatever asks
	 * for a picture calls `open`, and one that can be taken is handed to
	 * `onpick`, made ready to upload. One that cannot is said so.
	 */
	let { onpick }: { onpick: (picture: File) => void } = $props();

	let input = $state<HTMLInputElement>();

	export function open() {
		input?.click();
	}

	async function pick(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		// Emptied, so picking the same file again is still a change.
		event.currentTarget.value = '';
		if (!file) return;

		const picture = await preparePicture(file);
		if (picture) onpick(picture);
		else toast.error(m.image_invalid());
	}
</script>

<input bind:this={input} type="file" accept={IMAGE_ACCEPT} hidden onchange={pick} />
