/**
 * Discriminated union for the scope-picker's output. Kept in its own
 * TS module (not the `.svelte` file) so consumers can `import` it
 * without triggering a Svelte component import.
 */
export type ChatScopeChoice =
	| { kind: 'global' }
	| { kind: 'currentCase' }
	| { kind: 'currentWarRoom' }
	| { kind: 'currentAlert' }
	| { kind: 'pickCase'; caseId: number }
	| { kind: 'pickWarRoom'; warRoomId: number };
