let scrolled = $state(false);
let pinned = $state(false);
let toolbarHeight = $state(0);

/**
 * State of the app's content scroll region. The layout reports whether it has
 * scrolled; a page toolbar that pins itself claims the scroll edge (a hairline
 * once content has moved beneath it), so the breadcrumb bar shows the edge only
 * when no toolbar is pinned. One scroll edge per view. A pinned page toolbar
 * also reports its height, so whatever else stays in view as the page scrolls
 * can stop beneath it.
 */
export const scrollRegion = {
	get scrolled() {
		return scrolled;
	},
	set scrolled(value: boolean) {
		scrolled = value;
	},
	get pinned() {
		return pinned;
	},
	get toolbarHeight() {
		return toolbarHeight;
	},
	set toolbarHeight(value: number) {
		toolbarHeight = value;
	}
};

/** Marks a pinned page toolbar as present for as long as the component calling this is mounted. */
export function usePinnedToolbar() {
	$effect(() => {
		pinned = true;
		return () => {
			pinned = false;
			toolbarHeight = 0;
		};
	});
}
