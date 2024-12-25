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
            list: (caseId: number) => `/case/${caseId}/assets`,
        },
        getById: (caseId: number) => `/cases/${caseId}`,
        list: `/cases/list`,
    },
    alerts: {
        filter: `/alerts/filter`,
        details: (alertId: string) => `/alerts/${alertId}`,
    },
    auth: {
        login: `/auth/login`,
        logout: `/auth/logout`,
    }
};