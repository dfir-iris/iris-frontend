import type { HistoryData } from "$lib/components/common/ActivityHistory.svelte";

export interface Note {
	note_id: number;
	note_title: string;
	note_uuid?: string;
	note_content?: string;
	directory_id?: number;
	custom_attributes?: Record<string, Record<string, unknown>> | null;
	modification_history?: HistoryData;
}

export interface NoteFolder {
	id: number;
	name: string;
	note_count?: number;
	subdirectories: NoteFolder[];
	notes: Note[];
}
