import { onMount } from 'svelte';

let scrollTop = $state(0);
let pins = $state(0);
let bannerHeight = $state(0);
let tabsHeight = $state(0);
let toolbarHeight = $state(0);

/**
 * State of the app's content scroll region. The layout reports how far it has
 * scrolled; whatever pins itself to its top claims the scroll edge (a hairline
 * once content has moved beneath it), so the breadcrumb bar shows the edge only
 * when nothing is pinned. One scroll edge per view.
 *
 * A classroom pins its tab row, under a banner that scrolls away, and a page's
 * toolbar pins beneath the tabs. Both report their heights, so the toolbar
 * knows where to stop and when it has, and whatever else stays in view as the
 * page scrolls can stop beneath all of it.
 */
export const scrollRegion = {
	get scrollTop() {
		return scrollTop;
	},
	set scrollTop(value: number) {
		scrollTop = value;
	},
	get scrolled() {
		return scrollTop > 0;
	},
	get pinned() {
		return pins > 0;
	},
	/** A classroom's banner, which scrolls away before its tab row pins. */
	get bannerHeight() {
		return bannerHeight;
	},
	set bannerHeight(value: number) {
		bannerHeight = value;
	},
	/** A classroom's tab row, which a page's toolbar pins beneath. */
	get tabsHeight() {
		return tabsHeight;
	},
	set tabsHeight(value: number) {
		tabsHeight = value;
	},
	get toolbarHeight() {
		return toolbarHeight;
	},
	set toolbarHeight(value: number) {
		toolbarHeight = value;
	},
	/** Whether content has moved beneath a page's toolbar: only once what is above it has scrolled away. */
	get toolbarStuck() {
		return scrollTop > bannerHeight;
	},
	/** The height of everything that is pinned. */
	get pinnedHeight() {
		return tabsHeight + toolbarHeight;
	}
};

/** Marks something as pinned to the top of the scroll region for as long as the component calling this is mounted. */
export function usePinned() {
	onMount(() => {
		pins += 1;
		return () => {
			pins -= 1;
		};
	});
}
