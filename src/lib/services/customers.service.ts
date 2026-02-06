import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

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

export class CustomersService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Customer[]>> {
		return ApiService.get<Customer[]>(`/manage/customers/list`, options);
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
		return ApiService.post<Customer>(`/manage/customers/add`, body, options);
	}

	static async update(
		customerId: CustomerIdentifier,
		body: CustomerBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Customer>> {
		return ApiService.post<Customer>(`/manage/customers/update/${customerId}`, body, options);
	}

	static async remove(
		customerId: CustomerIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/customers/delete/${customerId}`, {}, options);
	}
}
