<script lang="ts">
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { m } from '#lib/paraglide/messages.js';
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ShieldIcon />
		</Empty.Media>
		<Empty.Title>{m.admin_home_title()}</Empty.Title>
		<Empty.Description>{m.admin_home_description()}</Empty.Description>
	</Empty.Header>
</Empty.Root>
