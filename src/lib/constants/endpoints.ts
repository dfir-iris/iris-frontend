import type { CaseQueryParams } from "$lib/types/resources/case"

/** Builds and formats an API endpoint with URL params. */
const buildUrl = (endpoint: string, params: Record<string, string | string[] | number | number[] | boolean>) => {
    for (const [k, v] of Object(params).entries()) {
        // Convert arrays to string separated with commas
        if (Array.isArray(v)) {
            params[k] = v.join(',')
            continue
        }
        // Let everything else get coerced to string
        params[k] = `${v}`
    }
    const urlParams = new URLSearchParams(params as Record<string, string>)
    return `${endpoint}?${urlParams.toString()}`
}

export const ENDPOINTS = {
    dashboard: {
        cases: {
            list: `/dashboard/cases/list`,
        },
        tasks: {
            list: `/dashboard/tasks/list`,
        },
        reviews: {
            list: `/dashboard/reviews/list`
        }
    },
    case: {
        assets: {
            list: (caseId: number | string) => `/case/${caseId}/assets`,
            getById: (assetId: number | string) => `/asset/${assetId}`,
        },
        notes: {
            list: (caseId: number | string) => `/case/${caseId}/notes`,
            getById: (noteId: number | string) => `/note/${noteId}`,
        },
        getById: (caseId: number | string) => `/case/${caseId}`,
        list: (params: CaseQueryParams) => buildUrl('/api/v2/cases', params),
    },
    alerts: {
        filter: `/alerts/filter`,
        details: (alertId: string | string) => `/alerts/${alertId}`,
    },
    auth: {
        login: `/auth/login`,
        logout: `/auth/logout`,
    }
};