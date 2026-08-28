import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEV } from 'esm-env';
import os from 'os';
import process from 'process';

export const GET: RequestHandler = async () => {
	// Only provide detailed info in dev mode
	if (!DEV) {
		return json({ message: 'Debug info only available in development mode' });
	}

	return json({
		time: new Date().toISOString(),
		node: {
			version: process.version,
			platform: process.platform,
			arch: process.arch,
			memoryUsage: process.memoryUsage(),
			cpus: os.cpus().length,
			totalMem: os.totalmem(),
			freeMem: os.freemem()
		},
		env: {
			NODE_ENV: process.env.NODE_ENV
			// Add any other safe environment variables you want to expose
		}
	});
};
