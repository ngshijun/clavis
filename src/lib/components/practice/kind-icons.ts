import type { Component } from 'svelte';
import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
import CircleDotIcon from '@lucide/svelte/icons/circle-dot';
import Columns3Icon from '@lucide/svelte/icons/columns-3';
import Grid2x2CheckIcon from '@lucide/svelte/icons/grid-2x2-check';
import HashIcon from '@lucide/svelte/icons/hash';
import HighlighterIcon from '@lucide/svelte/icons/highlighter';
import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
import MapPinIcon from '@lucide/svelte/icons/map-pin';
import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
import ShuffleIcon from '@lucide/svelte/icons/shuffle';
import SquareCheckIcon from '@lucide/svelte/icons/square-check';
import TextCursorInputIcon from '@lucide/svelte/icons/text-cursor-input';
import ToggleLeftIcon from '@lucide/svelte/icons/toggle-left';
import WholeWordIcon from '@lucide/svelte/icons/whole-word';
import type { ItemType } from '#lib/items/payload.js';

/**
 * The symbol each type is known by in the builder: beside its name in the
 * list of questions and wherever a type is picked, so a type can be found by
 * its shape.
 */
export const KIND_ICONS: Record<ItemType, Component> = {
	mcq: CircleDotIcon,
	mrq: SquareCheckIcon,
	true_false: ToggleLeftIcon,
	tick_table: Grid2x2CheckIcon,
	pick_words: HighlighterIcon,
	cloze: TextCursorInputIcon,
	short_answer: PencilLineIcon,
	word_completion: WholeWordIcon,
	numeric: HashIcon,
	matching: ArrowLeftRightIcon,
	ordering: ListOrderedIcon,
	rearrange: ShuffleIcon,
	classify: Columns3Icon,
	label_picture: MapPinIcon
};
