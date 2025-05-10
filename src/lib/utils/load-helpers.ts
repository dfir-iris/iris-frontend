import { safeLogError } from './error-handler';

/**
 * Helper function to safely load data in SvelteKit load functions
 * without crashing the application
 */
export async function safeLoadData<T>(
  dataPromise: Promise<T>,
  fallback: T,
  context: string
): Promise<{ data: T; error: any | null }> {
  try {
    const data = await dataPromise;
    return { data, error: null };
  } catch (error) {
    safeLogError(`Load function (${context})`, error);
    return { data: fallback, error };
  }
}
