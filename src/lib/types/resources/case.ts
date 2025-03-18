import type { UserInfo } from "$lib/stores/auth.store"

/**
 * MARK: CaseState ------------------------------------------------------------
 */
export interface CaseState {
  state_id: number
  protected: boolean
  state_description: string
  state_name: string
}

export interface Severity {
  severity_id: number
  severity_name: string
  severity_description: string
}

export interface CustomerInfo {
  customer_id: number
  customer_name: string
  customer_description: string
}

export interface Tags {
  tag_title: string,
  tag_id: number
}

/**
 * MARK: Case -----------------------------------------------------------------
 */
export interface Case {
  /** Identifiers */

  case_id: number
  case_uuid: string
  case_soc_id: string

  /** Meta */

  case_name: string
  case_description: string
  case_customer_id: number
  case_customer: CustomerInfo
  tags: Tags[]

  /** User references */

  user_id: number
  owner: UserInfo

  /** Review */

  reviewer_id: null
  review_status_id: null
  review_status: null

  /** Status & classification */

  state: CaseState
  status_id: number
  classification_id: number | null
  severity_id: number
  severity: Severity

  /** Timings */

  open_date: string | null
  close_date: string | null
  closing_note: string | null

  /** Other */

  custom_attributes: object | null
  modification_history: object | null
}


/**
 * MARK: CaseQueryParams ------------------------------------------------------
 */
/** All the allowed query parameters for cases. */
export type CaseQueryParams = {
  page?: number
  per_page?: number
  order_by?: string
  sort_dir?: string
  case_ids?: number[]
  case_customer_id?: number
  case_name?: string
  case_description?: string
  case_classification_id?: number
  case_owner_id?: number
  case_severity_id?: number
  case_state_id?: number
  case_soc_id?: string
  start_open_date?: string
  end_open_date?: string
  is_open?: boolean
}