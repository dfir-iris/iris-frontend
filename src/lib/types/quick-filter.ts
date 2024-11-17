export interface QuickFilter {
    field: string;
    label: string;
    options: Array<{
        value: string;
        label: string;
    }>;
}