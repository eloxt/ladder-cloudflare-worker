import { handleAdmin } from './handlers/admin';
import { handleSingBox } from './handlers/sing-box';
import { handleClash, handleClashTemplate, handleSurge } from './handlers/subscription';
import type { Env } from './types';

const paths = {
	surge: '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3',
	clash: '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737',
	clashTemplate: '/2774d2d9-d46b-4819-be0e-3d654270efcd/clash.yaml',
	singBox: '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad',
	admiral: '/sing-box/admiralxs/',
} as const;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === '/admin' || path.startsWith('/admin/')) return handleAdmin(request, env);
		if (path === paths.surge) return handleSurge(env);
		if (path === paths.clash) return handleClash(env);
		if (path === paths.clashTemplate) return handleClashTemplate(env);
		if (path === paths.singBox) return handleSingBox(env);
		if (path === `${paths.singBox}/mac`) return handleSingBox(env, 'eloxts-macbook-pro');
		if (path === `${paths.singBox}/iphone`) return handleSingBox(env, 'eloxts-iphone');
		if (path === `${paths.singBox}/ipad`) return handleSingBox(env, 'eloxts-ipad');
		if (path === `${paths.singBox}/wrt`) return handleSingBox(env, 'wrt');
		if (path.startsWith(paths.admiral)) return handleSingBox(env, path.slice(paths.admiral.length), true);
		return new Response('Not Found', { status: 404 });
	},
};
