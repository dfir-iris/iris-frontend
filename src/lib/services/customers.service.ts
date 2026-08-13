import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export type CustomerIdentifier = number;

export interface CustomerContact {
	id: number;
	client_id: number;
	contact_name: string;
	contact_email: string | null;
	contact_work_phone: string | null;
	contact_mobile_phone: string | null;
	contact_role: string | null;
	contact_note: string | null;
	contact_uuid: string;
	custom_attributes: Record<string, unknown> | null;
}

export interface Customer {
	customer_id: number;
	customer_name: string;
	customer_description: string | null;
	customer_sla: string | null;
	customer_uuid: string;
	contacts?: CustomerContact[];
	custom_attributes?: Record<string, unknown> | null;
}

export interface CustomerBody {
	customer_name?: string;
	customer_description?: string;
	customer_sla?: string;
	custom_attributes?: Record<string, unknown>;
}

export interface CustomerContactBody {
	contact_name?: string;
	contact_email?: string;
	contact_role?: string;
	contact_work_phone?: string;
	contact_mobile_phone?: string;
	contact_note?: string;
}

/**
 * A `RequestResponse` whose payload is guaranteed to be present.
 *
 * `RequestResponse<T>.data` is `T | string | null` because a failed
 * request carries the raw error body instead. Services that fold those
 * cases into a fallback value can promise the narrowed type, so callers
 * don't have to re-prove it with `Array.isArray`.
 */
export type ResolvedResponse<T> = Omit<RequestResponse<T>, 'data'> & { data: T };

export interface SearchCustomersParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	/** Case-insensitive ILIKE match across customer name + description. */
	search?: string;
}

export class CustomersService {
	/**
	 * Flat list for lookup controls (filter selects, form dropdowns).
	 *
	 * Unwraps the v2 paginated envelope so callers get a plain array —
	 * they used to each unwrap `res.data.data` themselves, and the ones
	 * that forgot silently rendered an empty dropdown. Mirrors
	 * `AssetTypesService.list()`.
	 *
	 * Callers that need the pagination envelope (totals, infinite
	 * scroll) should use `search()` below instead.
	 */
	static async list(options: ApiOptions = {}): Promise<ResolvedResponse<Customer[]>> {
		// The dropdowns need every customer, but the v2 backend defaults
		// to per_page=10 and would silently truncate the list — pass a
		// per_page large enough to cover any realistic deployment.
		const url = ApiService.withQuery('/manage/customers', { per_page: 10000 });
		const res = await ApiService.get<Paginated<Customer>>(url, options);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data ?? [] };
		}

		return { ...res, data: [] };
	}

	/**
	 * Typed paginated search backed by the v2 `GET /manage/customers`
	 * endpoint. Returns the full `{total, data, last_page, current_page,
	 * next_page}` envelope so consumers can drive infinite scroll.
	 */
	static async search(
		params: SearchCustomersParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Customer>>> {
		return ApiService.get<Paginated<Customer>>(
			ApiService.withQuery('/manage/customers', params as Record<string, unknown>),
			options
		);
	}

	static async get(
		customerId: CustomerIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Customer>> {
		return ApiService.get<Customer>(`/manage/customers/${customerId}`, options);
	}

	static async create(
		body: CustomerBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Customer>> {
		return ApiService.post<Customer>(`/manage/customers`, body, options);
	}

	static async update(
		customerId: CustomerIdentifier,
		body: CustomerBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Customer>> {
		return ApiService.put<Customer>(`/manage/customers/${customerId}`, body, options);
	}

	static async remove(
		customerId: CustomerIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/customers/${customerId}`, options);
	}

	// Contacts ---------------------------------------------------------
	static async listContacts(
		customerId: CustomerIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomerContact[]>> {
		return ApiService.get<CustomerContact[]>(
			`/manage/customers/${customerId}/contacts`,
			options
		);
	}

	static async createContact(
		customerId: CustomerIdentifier,
		body: CustomerContactBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomerContact>> {
		return ApiService.post<CustomerContact>(
			`/manage/customers/${customerId}/contacts`,
			body,
			options
		);
	}

	static async updateContact(
		customerId: CustomerIdentifier,
		contactId: number,
		body: CustomerContactBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CustomerContact>> {
		return ApiService.put<CustomerContact>(
			`/manage/customers/${customerId}/contacts/${contactId}`,
			body,
			options
		);
	}

	static async removeContact(
		customerId: CustomerIdentifier,
		contactId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/manage/customers/${customerId}/contacts/${contactId}`,
			options
		);
	}
}
