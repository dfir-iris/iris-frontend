import type { Tag, TagInput } from '$lib/types/resources/tag';

export const stringToTags = (tagString: string): Tag[] => {
	if (!tagString) return [];

	return tagString
		.split(',')
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0)
		.map((tag_title, index) => ({
			tag_id: -1000 - index,
			tag_title
		}));
};

export const tagsToString = (tags: Tag[]): string => {
	return tags.map((tag) => tag.tag_title).join(',');
};

export const normalizeTags = (input: TagInput | null | undefined): Tag[] => {
	if (!input) return [];

	if (typeof input === 'string') {
		return stringToTags(input);
	}

	return input;
};
