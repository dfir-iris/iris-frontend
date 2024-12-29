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
        },
        notes: {
            list: (caseId: number | string) => `/cases/${caseId}/notes`
        },
        getById: (caseId: number | string) => `/cases/${caseId}`,
        list: `/cases/list`,
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