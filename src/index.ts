import { handleSingBox } from './handlers/sing-box';
import { DAE_DATA_PATH, handleDaeData, handleDaeRequest, handleDaeSubscriptionRequest } from './handlers/dae';
import { handleStatic } from './handlers/static';
import { handleClash, handleSurge } from './handlers/subscription';
import type { Env } from './types';

const paths = {
	surge: '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3',
	clash: '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737',
	singBox: '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad',
	dae: '/dae/7a4b2d7e-3a8d-4a5f-b3d0-3b78d6a15b8d',
	daeConfig: '/dae-config/7a4b2d7e-3a8d-4a5f-b3d0-3b78d6a15b8d',
	daeData: DAE_DATA_PATH,
	admiral: '/sing-box/admiralxs/',
	static: '/2774d2d9-d46b-4819-be0e-3d654270efcd/',
} as const;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === paths.surge) return handleSurge(env);
		if (path === paths.clash) return handleClash(env);
		if (path === paths.singBox) return handleSingBox(env);
		if (path === paths.dae) return handleDaeSubscriptionRequest(env);
		if (path === paths.daeConfig) return handleDaeRequest(env, request);
		if (path.startsWith(`${paths.daeData}/`)) return handleDaeData(path, env.STATIC_BUCKET, request.method);
		if (path === `${paths.singBox}/mac`) return handleSingBox(env, 'eloxts-macbook-pro');
		if (path === `${paths.singBox}/iphone`) return handleSingBox(env, 'eloxts-iphone');
		if (path === `${paths.singBox}/ipad`) return handleSingBox(env, 'eloxts-ipad');
		if (path === `${paths.singBox}/wrt`) return handleSingBox(env, 'wrt');
		if (path.startsWith(paths.admiral)) return handleSingBox(env, path.slice(paths.admiral.length), env.TAILSCALE_ADMIRAL_AUTH_KEY);
		if (path.startsWith(paths.static)) return handleStatic(path, env.STATIC_BUCKET);
		return new Response('Not Found', { status: 404 });
	},
};
