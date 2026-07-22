/** Builds and formats an API endpoint with URL params. */
const buildUrl = (endpoint: string, params: Record<string, string | string[] | number | number[] | boolean>) => {
    for (const [k, v] of Object.entries(params)) {
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

function buildParameters(parameters: Record<string, any>) {
    if (!parameters) {
        return ''
    }
    return `?${Object.keys(parameters).map((key) => {
        return `${key}=${parameters[key]}`
    }).join('&')}`
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
            list: (caseId: number | string, parameters: object) => `/cases/${caseId}/assets${buildParameters(parameters)}`,
            getById: (caseId: number | string, assetId: number | string) => `/cases/${caseId}/assets/${assetId}`,
            update: (caseId: number | string, assetId: number | string) => `/cases/${caseId}/assets/${assetId}`,
            add: (caseId: number | string) => `/cases/${caseId}/assets`,
            delete: (caseId: number | string, assetId: number | string) => `/cases/${caseId}/assets/${assetId}`,
        },
        notes: {
            list: (caseId: number | string) => `/case/${caseId}/notes`,
            getById: (noteId: number | string) => `/note/${noteId}`,
        },
        ioc: {
            list: (caseId: number | string, parameters: object = {}) => `/cases/${caseId}/iocs${buildParameters(parameters)}`,
            update: (caseId: number | string, iocId: number | string) => `/cases/${caseId}/iocs/${iocId}`,
            add: (caseId: number | string) => `/cases/${caseId}/iocs`,
            getById: (caseId: number | string, iocId: number | string) => `/cases/${caseId}/iocs/${iocId}`,
            delete: (caseId: number | string, iocId: number | string) => `/cases/${caseId}/iocs/${iocId}`,
        },
        getById: (caseId: number | string) => `/cases/${caseId}`,
        list: `/cases`,
    },
    alerts: {
        filter: `/alerts`,
        details: (alertId: string | string) => `/alerts/${alertId}`,
    },
    auth: {
        login: `/auth/login`,
        logout: `/auth/logout`
    },
    tags: {
        list: '/tags'
    },
    manage: {
        ioc_types: {
            list: '/manage/case-objects/ioc-types',
        },
        tlp: {
            list: '/manage/tlp',
        }
    }
};