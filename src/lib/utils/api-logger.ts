import { browser } from '$app/environment';
import { DEV } from 'esm-env';

// Configuration for the logger
export const ApiLoggerConfig = {
  enabled: DEV || (browser && localStorage.getItem('debug_api') === 'true'),
  logRequestBody: true,
  logResponseBody: true,
  truncateBodyAt: 1000, // Characters to show before truncating
  colorizeOutput: browser, // Use colors in browser console
};

/**
 * Logger utility for API requests and responses
 */
export class ApiLogger {
  static configure(options: Partial<typeof ApiLoggerConfig>) {
    Object.assign(ApiLoggerConfig, options);
  }

  static enable() {
    if (browser) localStorage.setItem('debug_api', 'true');
    ApiLoggerConfig.enabled = true;
  }

  static disable() {
    if (browser) localStorage.removeItem('debug_api');
    ApiLoggerConfig.enabled = false;
  }

  static logRequest(method: string, url: string, headers: Record<string, string>, body?: any) {
    if (!ApiLoggerConfig.enabled) return;
    
    const styles = ApiLoggerConfig.colorizeOutput 
      ? 'color: #61affe; font-weight: bold;' 
      : '';
    
    console.groupCollapsed(`%c→ ${method} ${url}`, styles);
    console.log('Headers:', headers);
    
    if (ApiLoggerConfig.logRequestBody && body) {
      try {
        console.log('Body:', this.truncateIfNeeded(body));
      } catch (e) {
        console.log('Body: [Could not stringify]');
      }
    }
    
    console.groupEnd();
  }

  static logResponse(method: string, url: string, status: number, headers: Record<string, string>, body?: any, duration?: number) {
    if (!ApiLoggerConfig.enabled) return;
    
    const isSuccess = status >= 200 && status < 300;
    const styles = ApiLoggerConfig.colorizeOutput 
      ? `color: ${isSuccess ? '#49cc90' : '#f93e3e'}; font-weight: bold;` 
      : '';
    
    const durationText = duration ? ` (${duration}ms)` : '';
    
    console.groupCollapsed(`%c← ${status} ${method} ${url}${durationText}`, styles);
    console.log('Headers:', headers);
    
    if (ApiLoggerConfig.logResponseBody && body) {
      try {
        console.log('Body:', this.truncateIfNeeded(body));
      } catch (e) {
        console.log('Body: [Could not stringify]');
      }
    }
    
    console.groupEnd();
  }

  private static truncateIfNeeded(data: any): any {
    if (!data) return data;
    
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= ApiLoggerConfig.truncateBodyAt) return data;
    
    if (typeof data === 'string') {
      return `${str.substring(0, ApiLoggerConfig.truncateBodyAt)}... [truncated, ${str.length} chars total]`;
    }
    
    return {
      ...data,
      _note: `Response truncated. Original size: ${str.length} chars`
    };
  }
}
