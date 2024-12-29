export interface NoteFolder {
  id: number
  name: string
  note_count: number
  subdirectories: NoteFolder[],
  notes: Note[]
}

export interface Note {
  id: number
  title: string
}