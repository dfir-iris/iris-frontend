export interface EvidenceType {
	id: number;
	name: string;
	description: string | null;
}

export interface EvidenceUser {
	id: number;
	user_name: string;
	user_login: string;
	user_email: string;
}

export interface Evidence {
	id: number;
	file_uuid: string;
	filename: string;
	date_added: string | null;
	acquisition_date: string | null;
	file_hash: string | null;
	file_description: string | null;
	file_size: number | null;
	start_date: string | null;
	end_date: string | null;
	case_id: number;
	user_id: number;
	type_id: number | null;
	type: EvidenceType | null;
	user: EvidenceUser | null;
	custom_attributes: Record<string, unknown> | null;
	chain_of_custody: Record<string, unknown> | null;
	modification_history: Record<string, unknown> | null;
}
