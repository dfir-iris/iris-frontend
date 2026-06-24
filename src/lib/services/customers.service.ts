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

export interface SearchCustomersParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
}

export class CustomersService {
	/**
	 * Legacy-shape list — every caller historically reaches into
	 * `res.data.data` to unwrap the v2 paginated envelope. Kept as-is
	 * so `CaseAddModal` / `CaseEditor` callers don't need to change;
	 * new paginated callers should use `search()` below instead.
	 */
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Customer[]>> {
		return ApiService.get<Customer[]>(`/manage/customers`, options);
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
