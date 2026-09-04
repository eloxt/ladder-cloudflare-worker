import { loadConfig, saveConfig, validateConfig } from '../config';
import type { Env } from '../types';

const sessionCookie = 'ladder_admin_session';
const sessionDurationSeconds = 12 * 60 * 60;

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
	return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function encode(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string): Uint8Array<ArrayBuffer> {
	const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function sign(value: string, password: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return encode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function passwordsMatch(input: string, expected: string): Promise<boolean> {
	const [left, right] = await Promise.all([
		crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)),
		crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
	]);
	return crypto.subtle.timingSafeEqual(left, right);
}

async function sessionIsValid(request: Request, password: string): Promise<boolean> {
	const cookie = request.headers.get('Cookie') || '';
	const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
	if (!token) return false;
	const [expires, signature] = token.split('.');
	if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
	const expected = await sign(expires, password);
	try {
		const actualBytes = decode(signature);
		const expectedBytes = decode(expected);
		return actualBytes.byteLength === expectedBytes.byteLength && crypto.subtle.timingSafeEqual(actualBytes, expectedBytes);
	} catch {
		return false;
	}
}

function sameOrigin(request: Request): boolean {
	return request.headers.get('Origin') === new URL(request.url).origin;
}

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
	if (!env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD 尚未配置' }, 503);
	const url = new URL(request.url);
	if ((url.pathname === '/admin' || url.pathname === '/admin/') && request.method === 'GET') {
		const asset = await env.ASSETS.fetch(new URL('/index.html', request.url));
		const headers = new Headers(asset.headers);
		headers.set('Cache-Control', 'no-store');
		headers.set(
			'Content-Security-Policy',
			"default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
		);
		headers.set('Referrer-Policy', 'no-referrer');
		headers.set('X-Content-Type-Options', 'nosniff');
		return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
	}
	if (!url.pathname.startsWith('/admin/api/')) return new Response('Not Found', { status: 404 });
	if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: '请求来源无效' }, 403);

	if (url.pathname === '/admin/api/login' && request.method === 'POST') {
		const body = await request.text();
		if (body.length > 2048) return json({ error: '请求过大' }, 413);
		let password = '';
		try {
			password = String((JSON.parse(body) as { password?: unknown }).password || '');
		} catch {
			return json({ error: '请求格式无效' }, 400);
		}
		if (!(await passwordsMatch(password, env.ADMIN_PASSWORD))) return json({ error: '管理员密码错误' }, 401);
		const expires = String(Math.floor(Date.now() / 1000) + sessionDurationSeconds);
		const token = `${expires}.${await sign(expires, env.ADMIN_PASSWORD)}`;
		return json({ ok: true }, 200, {
			'Set-Cookie': `${sessionCookie}=${token}; Max-Age=${sessionDurationSeconds}; Path=/admin; HttpOnly; Secure; SameSite=Strict`,
		});
	}

	if (url.pathname === '/admin/api/logout' && request.method === 'POST') {
		return json({ ok: true }, 200, { 'Set-Cookie': `${sessionCookie}=; Max-Age=0; Path=/admin; HttpOnly; Secure; SameSite=Strict` });
	}
	if (!(await sessionIsValid(request, env.ADMIN_PASSWORD))) return json({ error: '请先登录' }, 401);
	if (url.pathname === '/admin/api/config' && request.method === 'GET') return json(await loadConfig(env));
	if (url.pathname === '/admin/api/config' && request.method === 'PUT') {
		const declaredSize = Number(request.headers.get('Content-Length') || 0);
		if (declaredSize > 1024 * 1024) return json({ error: '配置总大小不能超过 1 MiB' }, 413);
		const body = await request.text();
		if (new TextEncoder().encode(body).byteLength > 1024 * 1024) return json({ error: '配置总大小不能超过 1 MiB' }, 413);
		try {
			return json(await saveConfig(env, validateConfig(JSON.parse(body))));
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : '配置无效' }, 400);
		}
	}
	return json({ error: 'Not Found' }, 404);
}
