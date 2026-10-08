import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type KeystoreScope = 'personal' | 'shared';

/**
 * A keystore entry as the API returns it. Secret entries come back with
 * `value: null` and `has_value: true`: the value is write-only.
 */
export interface KeystoreEntry {
	id: number;
	name: string;
	is_secret: boolean;
	value: string | null;
	has_value: boolean;
	description: string | null;
	scope: KeystoreScope;
	owner: { id: number; login: string | null; name: string | null } | null;
	allowed_group_ids: number[];
	allowed_hosts: string[];
	created_at: string | null;
	updated_at: string | null;
	last_used_at: string | null;
}

/**
 * Write body. On update, an omitted or `null` value on a secret entry
 * keeps the stored value.
 */
export interface KeystoreEntryBody {
	name?: string;
	value?: string | null;
	is_secret?: boolean;
	description?: string | null;
	scope?: KeystoreScope;
	allowed_group_ids?: number[];
	allowed_hosts?: string[];
}

/** Names accepted by the backend. */
export const KEYSTORE_NAME_RE = /^[A-Z0-9_]{1,64}$/;

const BASE = '/keystore';

export class KeystoreService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<KeystoreEntry[]>> {
		return ApiService.get<KeystoreEntry[]>(BASE, options);
	}

	static async create(
		body: KeystoreEntryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<KeystoreEntry>> {
		return ApiService.post<KeystoreEntry>(BASE, body, options);
	}

	static async update(
		id: number,
		body: KeystoreEntryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<KeystoreEntry>> {
		return ApiService.put<KeystoreEntry>(`${BASE}/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${id}`, options);
	}
}
