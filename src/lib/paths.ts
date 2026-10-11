import { resolve } from '$app/paths';
import type { Path, ResolvedPathname } from '$app/types';

/**
 * The address of one of the app's pages, for a path held in a variable: a
 * link's `href`, what a path helper returns. A path written out where it is
 * used goes to `resolve` itself.
 *
 * They are the same function. `resolve` is typed with one signature for each
 * page, and TypeScript stops matching a value that may be any of them against
 * the signatures one by one once there are more than 25. Here it is said once
 * that any of the app's paths will do.
 */
export const resolvePath = resolve as (path: Path) => ResolvedPathname;
