import { writable } from 'svelte/store';

export const alertsStore = createAlertStore();
export const isLoadingAlertsStore = writable(true);

type AlertStore = {
    alerts: any[];
    selected: any | null;
};

function createAlertStore() {
    const store = writable<AlertStore>({ alerts: [], selected: null });

    return {
        subscribe: store.subscribe,
        set: (alerts: any[]) => {
            store.update((store) => ({ ...store, alerts }));
        },
        setAlert: (id: number) => {
            store.update((store) => ({
                ...store,
                selected: store.alerts.find((alert) => alert.alert_id === id) || null,
            }));
        },
    };
}