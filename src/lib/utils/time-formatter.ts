export interface TimeFormatterConfig {
    timezone?: string;
    format?: 'short' | 'medium' | 'long';
    locale?: string;
}

export class TimeFormatter {
    private static defaultConfig: TimeFormatterConfig = {
        timezone: 'UTC',
        format: 'medium',
        locale: 'en-US'
    };

    static format(date: string, config: TimeFormatterConfig = {}) {
        const { timezone, format, locale } = { ...this.defaultConfig, ...config };

        const formatOptions: Intl.DateTimeFormatOptions = {
            timeZone: timezone,
            dateStyle: format,
            timeStyle: format
        };

        return new Intl.DateTimeFormat(locale, formatOptions).format(new Date(date));
    }
}


const mediumDateTimeFormat = new Intl.DateTimeFormat(undefined, {
    'dateStyle': 'medium',
    'timeStyle': 'short'
})


export const mediumDateTimeFormatter = (value: Date | number) => mediumDateTimeFormat.format(value)