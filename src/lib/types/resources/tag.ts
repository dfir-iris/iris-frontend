export interface Tag {
	tag_id: number;
	tag_title: string;
	tag_color?: string;
	created_at?: string;
	updated_at?: string;
}

export type TagInput = Tag[] | string;
