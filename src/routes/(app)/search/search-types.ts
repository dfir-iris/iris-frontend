import type { SearchType } from '$lib/services/search.service';

/**
 * Fold a chip click into the "Search within" selection.
 *
 * The chip row starts with every category lit, which reads as "no
 * narrowing" rather than as eight independent choices that all happen
 * to be on. Toggling plainly from there made the first click *negate*
 * the category — picking "IOC" searched everything except IOCs, the
 * opposite of what picking a category means. So the first pick out of
 * the all-selected state becomes the sole filter, and only once the
 * selection is genuinely narrowed do further clicks add and remove.
 */
export const toggleSearchType = (
	selected: readonly SearchType[],
	type: SearchType,
	allTypes: readonly SearchType[]
): SearchType[] => {
	const isUnnarrowed = allTypes.length > 0 && allTypes.every((t) => selected.includes(t));

	if (isUnnarrowed) return [type];

	if (selected.includes(type)) {
		const next = selected.filter((t) => t !== type);

		// Turning off the last remaining category leaves a scope that
		// cannot be searched at all, so the click would just arm a
		// warning toast. Send it back to the unnarrowed state instead —
		// the natural inverse of the narrowing click above. "None" is
		// still reachable through its own button.
		return next.length > 0 ? next : [...allTypes];
	}

	// Rebuilt in catalog order rather than appended, so the chip row,
	// the `types` URL parameter and the request payload stay in a
	// stable order no matter what sequence the user clicked in.
	return allTypes.filter((t) => selected.includes(t) || t === type);
};
