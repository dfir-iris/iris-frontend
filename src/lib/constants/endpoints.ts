export const ENDPOINTS = {
    user: {
        cases: {
            list: `/user/cases/list`,
        },
        tasks: {
            list:`/user/tasks/list`,
        },
        reviews: {
            list: `/user/reviews/list`
        }
    },
    case: {
        assets: {
            list: (case_id: number) => `/case/${case_id}/assets`,
        }
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