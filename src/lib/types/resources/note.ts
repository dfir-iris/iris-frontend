export interface NoteFolder {
	id: number;
	name: string;
	note_count: number;
	subdirectories: NoteFolder[];
	notes: Note[];
}

export interface Note {
	note_id: number;
	note_title: string;
	note_content: string;
	directory_id: number;
	created_at?: string;
	updated_at?: string;
}
