import type { HistoryData } from '$lib/components/common/ActivityHistory.svelte';

/** Present on a case note that is a read-only mirror of a war-room note. */
export interface NoteMirrorInfo {
	war_room_id: number | null;
	war_room_name: string | null;
	source_note_id: number | null;
	read_only: true;
}

export interface Note {
	note_id: number;
	note_title: string;
	note_uuid?: string;
	note_content?: string;
	directory_id?: number;
	custom_attributes?: Record<string, Record<string, unknown>> | null;
	modification_history?: HistoryData;
	/** War-room note this case note mirrors (read-only when set). */
	mirror_source_note_id?: number | null;
	mirror_war_room_id?: number | null;
	mirror?: NoteMirrorInfo | null;
}

export interface NoteFolder {
	id: number;
	name: string;
	note_count?: number;
	subdirectories: NoteFolder[];
	notes: Note[];
	/** Set on the locked "War room · <name>" directory holding mirrors. */
	mirror_war_room_id?: number | null;
}
