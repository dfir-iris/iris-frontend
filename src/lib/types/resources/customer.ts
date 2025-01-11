import type { CustomAttributes } from "./common";

export interface Customer {
  customer_name: string;
  customer_description: string | null;
  customer_sla: string | null;
  customer_id: number;
  client_uuid: string;
  creation_date: string;
  last_update_date: string;
  custom_attributes: CustomAttributes;
}