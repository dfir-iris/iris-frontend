/**
 * Utility functions for error handling
 */

/**
 * Safely logs errors without causing additional issues
 */
export function safeLogError(context: string, error: any): void {
	try {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[${context}] Error: ${errorMessage}`);

		// Log additional details if available
		if (error instanceof Error && error.cause) {
			console.error(`[${context}] Cause:`, error.cause);
		}

		// Log stack trace in non-production environments
		if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.stack) {
			console.error(`[${context}] Stack:`, error.stack);
		}
	} catch (_loggingError) {
		// Last resort if even logging fails
		console.error('Failed to log error details');
	}
}

/**
 * Determines if an error is related to CORS
 */
export function isCorsError(error: any): boolean {
	if (!error) return false;

	const errorMessage = error instanceof Error ? error.message : String(error);
	return errorMessage.includes('CORS') || (error.cause && String(error.cause).includes('CORS'));
}
