import YAML from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { ProviderConfig } from '../src/types';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

interface ConfigFixture {
	providers?: ProviderConfig[];
	extraNodes?: string;
	clashTemplate?: string;
	singBoxTemplate?: string;
}

function createEnv(fixture: ConfigFixture = {}): WorkerEnv {
	return {
		ASSETS: {
			fetch: async () => new Response('<!doctype html><html><body><div id="root"></div></body></html>', { headers: { 'Content-Type': 'text/html' } }),
		} as unknown as Fetcher,
		DB: {
			prepare: () => ({
				first: async () => ({
					providers: JSON.stringify(
						fixture.providers || [
							{ id: 'yecao', name: '野草', url: 'https://provider.example.test/yecao', enabled: true, addFlag: true },
							{ id: 'liangxin', name: '良心云', url: 'https://provider.example.test/liangxin', enabled: true },
							{ id: 'xflash', name: 'XFlash', url: 'https://provider.example.test/xflash', enabled: true },
						],
					),
					extra_nodes: fixture.extraNodes || 'proxies: []\n',
					tailscale_auth_key: 'database-tailscale-key',
					tailscale_admiral_auth_key: 'database-admiral-key',
					clash_template: fixture.clashTemplate || 'proxies: []\n',
					sing_box_template:
						fixture.singBoxTemplate || JSON.stringify({ endpoints: [], inbounds: [], route: { rules: [] }, outbounds: [] }),
					updated_at: '2026-09-04T00:00:00.000Z',
				}),
				bind: () => ({ run: async () => ({ success: true }) }),
			}),
		} as unknown as D1Database,
		ADMIN_PASSWORD: 'test-admin-password',
	};
}

describe('parseConfig via clash endpoint', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('adds named separators for each non-empty provider group', async () => {
		const env = createEnv({
			extraNodes: YAML.dump({ proxies: [{ name: '美国自建', type: 'trojan', server: 'self.example.com', port: 443, password: 'self' }] }),
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('/yecao')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: '香港一号', type: 'trojan', server: 'hk.example.com', port: 443, password: 'hk' }],
						}),
						{
							headers: {
								'subscription-userinfo': 'upload=1704310932; download=72047148323; total=96636764160; expire=1804089600',
							},
						},
					);
				}
				if (url.includes('/liangxin')) {
					return new Response(YAML.dump({ proxies: [] }));
				}
				if (url.includes('/xflash')) {
					return new Response(
						YAML.dump({
							proxies: [
								{ name: '新加坡一号', type: 'trojan', server: 'sg.example.com', port: 443, password: 'sg' },
								{ name: '日本一号', type: 'trojan', server: 'jp.example.com', port: 443, password: 'jp' },
							],
						}),
						{
							headers: {
								'subscription-userinfo': 'upload=0; download=1073741824; total=2147483648; expire=1893456000',
							},
						},
					);
				}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);

		const response = await worker.fetch(
			new Request('https://example.com/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737'),
			env,
		);
		const config = YAML.load(await response.text()) as { proxies: Array<{ name: string; type: string; server: string; port: number }> };

		expect(config.proxies.map((proxy) => proxy.name)).toEqual([
			'🇺🇸 美国自建',
			'---自建节点---',
			'🇭🇰 香港一号',
			'---野草 剩余 21.31 GB 到期 2027-03-04---',
			'新加坡一号',
			'日本一号',
			'---XFlash 剩余 1.00 GB 到期 2030-01-01---',
		]);
		expect(config.proxies[2]).toEqual({
			name: '🇭🇰 香港一号',
			type: 'trojan',
			server: 'hk.example.com',
			port: 443,
			password: 'hk',
		});
		expect(config.proxies[3]).toEqual({
			name: '---野草 剩余 21.31 GB 到期 2027-03-04---',
			type: 'trojan',
			server: '127.0.0.1',
			port: 55555,
			password: '',
		});
		expect(config.proxies[6]).toEqual({
			name: '---XFlash 剩余 1.00 GB 到期 2030-01-01---',
			type: 'trojan',
			server: '127.0.0.1',
			port: 55555,
			password: '',
		});
	});

	it('skips a provider when its yaml payload cannot be parsed', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('/yecao')) {
					return new Response('proxies: [');
				}
				if (url.includes('/liangxin')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: '良心云一号', type: 'trojan', server: 'lx.example.com', port: 443, password: 'lx' }],
						}),
					);
				}
				if (url.includes('/xflash')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: 'XFlash一号', type: 'trojan', server: 'xf.example.com', port: 443, password: 'xf' }],
						}),
					);
				}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);

		const response = await worker.fetch(
			new Request('https://example.com/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737'),
			createEnv(),
		);
		const config = YAML.load(await response.text()) as { proxies: Array<{ name: string }> };
		const names = config.proxies.map((proxy) => proxy.name);

		expect(names).toEqual(['---自建节点---', '良心云一号', '---良心云---', 'XFlash一号', '---XFlash---']);
		expect(names.some((name) => name.includes('野草'))).toBe(false);
	});

	it('does not fetch disabled providers', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await worker.fetch(
			new Request('https://example.com/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737'),
			createEnv({
				providers: [{ id: 'disabled', name: '已停用', url: 'https://provider.example.test/disabled', enabled: false }],
			}),
		);

		expect(response.status).toBe(200);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('serves the configured Clash template from the static template route', async () => {
		const clashTemplate = 'mode: rule\nrules:\n  - MATCH,DIRECT\n';
		const response = await worker.fetch(
			new Request('https://example.com/2774d2d9-d46b-4819-be0e-3d654270efcd/clash.yaml'),
			createEnv({ clashTemplate }),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('Content-Type')).toBe('text/yaml;charset=utf-8');
		expect(await response.text()).toBe(clashTemplate);
	});
});

describe('admin configuration', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('serves the admin page without exposing the password', async () => {
		const response = await worker.fetch(new Request('https://example.com/admin'), createEnv());
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
		expect(html).toContain('<div id="root"></div>');
		expect(html).not.toContain('test-admin-password');
	});

	it('requires a valid password and signed session cookie for config access', async () => {
		const env = createEnv();
		const headers = { Origin: 'https://example.com', 'Content-Type': 'application/json' };
		const denied = await worker.fetch(
			new Request('https://example.com/admin/api/login', { method: 'POST', headers, body: JSON.stringify({ password: 'wrong' }) }),
			env,
		);
		expect(denied.status).toBe(401);

		const login = await worker.fetch(
			new Request('https://example.com/admin/api/login', {
				method: 'POST',
				headers,
				body: JSON.stringify({ password: 'test-admin-password' }),
			}),
			env,
		);
		const cookie = login.headers.get('Set-Cookie');
		expect(login.status).toBe(200);
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Strict');

		const config = await worker.fetch(
			new Request('https://example.com/admin/api/config', { headers: { Cookie: cookie! } }),
			env,
		);
		expect(config.status).toBe(200);
		expect((await config.json()) as { providers: unknown[] }).toMatchObject({ providers: expect.any(Array) });
	});

	it('validates and saves the complete configuration', async () => {
		const env = createEnv();
		const originHeaders = { Origin: 'https://example.com', 'Content-Type': 'application/json' };
		const login = await worker.fetch(
			new Request('https://example.com/admin/api/login', {
				method: 'POST',
				headers: originHeaders,
				body: JSON.stringify({ password: 'test-admin-password' }),
			}),
			env,
		);
		const response = await worker.fetch(
			new Request('https://example.com/admin/api/config', {
				method: 'PUT',
				headers: { ...originHeaders, Cookie: login.headers.get('Set-Cookie')! },
				body: JSON.stringify({
					providers: [{ id: 'provider-1', name: '订阅一', url: 'https://provider.example.test/sub', enabled: true }],
					extraNodes: 'proxies: []\n',
					tailscaleAuthKey: 'saved-tailscale-key',
					tailscaleAdmiralAuthKey: 'saved-admiral-key',
					clashTemplate: 'mode: rule\nproxies: []\n',
					singBoxTemplate: JSON.stringify({ endpoints: [], inbounds: [], outbounds: [], route: { rules: [] } }),
				}),
			}),
			env,
		);
		const saved = (await response.json()) as {
			providers: unknown[];
			tailscaleAuthKey: string;
			tailscaleAdmiralAuthKey: string;
			updatedAt: string;
		};

		expect(response.status).toBe(200);
		expect(saved.providers).toHaveLength(1);
		expect(saved.tailscaleAuthKey).toBe('saved-tailscale-key');
		expect(saved.tailscaleAdmiralAuthKey).toBe('saved-admiral-key');
		expect(saved.updatedAt).toMatch(/^2026-/);
	});

	it('rejects malformed session cookies as unauthorized', async () => {
		const response = await worker.fetch(
			new Request('https://example.com/admin/api/config', { headers: { Cookie: 'ladder_admin_session=9999999999.not-base64!' } }),
			createEnv(),
		);
		expect(response.status).toBe(401);
	});
});

describe('sing-box conversion', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('converts vless nodes to sing-box outbounds', async () => {
		const env = createEnv({
			extraNodes: YAML.dump({
				proxies: [
					{
						name: '美国 VLESS',
						type: 'vless',
						server: 'vless.example.com',
						port: 443,
						uuid: 'bf000d23-0752-40b4-affe-68f7707a9661',
						tls: true,
						servername: 'cdn.example.com',
						network: 'ws',
						'ws-opts': {
							path: '/ws',
							headers: {
								Host: 'cdn.example.com',
							},
						},
						'client-fingerprint': 'chrome',
					},
				],
			}),
			singBoxTemplate: JSON.stringify({ endpoints: [], route: { rules: [] }, outbounds: [] }),
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(YAML.dump({ proxies: [] }))),
		);

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			env,
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇺🇸 美国 VLESS');

		expect(outbound).toEqual({
			type: 'vless',
			tag: '🇺🇸 美国 VLESS',
			server: 'vless.example.com',
			server_port: 443,
			uuid: 'bf000d23-0752-40b4-affe-68f7707a9661',
			tls: {
				enabled: true,
				server_name: 'cdn.example.com',
				utls: {
					enabled: true,
					fingerprint: 'chrome',
				},
			},
			transport: {
				type: 'ws',
				path: '/ws',
				headers: {
					Host: 'cdn.example.com',
				},
			},
		});
	});

	it('converts vless tcp reality nodes to sing-box outbounds', async () => {
		const env = createEnv({
			extraNodes: YAML.dump({
				proxies: [
					{
						name: '美国 Mock VLESS',
						type: 'vless',
						server: '203.0.113.10',
						port: 443,
						uuid: '11111111-2222-4333-8444-555555555555',
						network: 'tcp',
						tls: true,
						udp: true,
						flow: 'xtls-rprx-vision',
						servername: 'stream.example.com',
						'client-fingerprint': 'chrome',
						'reality-opts': {
							'public-key': 'mockRealityPublicKeyForSingBoxTest1234567890',
							'short-id': '0123456789abcdef',
						},
					},
				],
			}),
			singBoxTemplate: JSON.stringify({ endpoints: [], route: { rules: [] }, outbounds: [] }),
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(YAML.dump({ proxies: [] }))),
		);

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			env,
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇺🇸 美国 Mock VLESS');

		expect(outbound).toEqual({
			type: 'vless',
			tag: '🇺🇸 美国 Mock VLESS',
			server: '203.0.113.10',
			server_port: 443,
			uuid: '11111111-2222-4333-8444-555555555555',
			flow: 'xtls-rprx-vision',
			tls: {
				enabled: true,
				server_name: 'stream.example.com',
				utls: {
					enabled: true,
					fingerprint: 'chrome',
				},
				reality: {
					enabled: true,
					public_key: 'mockRealityPublicKeyForSingBoxTest1234567890',
					short_id: '0123456789abcdef',
				},
			},
		});
	});

	it('converts anytls nodes to sing-box outbounds', async () => {
		const env = createEnv({
			extraNodes: YAML.dump({
				proxies: [
					{
						name: '澳大利亚',
						type: 'anytls',
						server: '03.giant.au.example.com',
						port: 443,
						password: 'example',
						'client-fingerprint': 'firefox',
						sni: 'dss0.bdstatic.com',
						'skip-cert-verify': true,
					},
				],
			}),
			singBoxTemplate: JSON.stringify({ endpoints: [], route: { rules: [] }, outbounds: [] }),
		});

		vi.stubGlobal('fetch', vi.fn(async () => new Response(YAML.dump({ proxies: [] }))));

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			env,
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇦🇹 澳大利亚');

		expect(outbound).toEqual({
			type: 'anytls',
			tag: '🇦🇹 澳大利亚',
			server: '03.giant.au.example.com',
			server_port: 443,
			password: 'example',
			tls: {
				enabled: true,
				server_name: 'dss0.bdstatic.com',
				insecure: true,
				utls: { enabled: true, fingerprint: 'firefox' },
			},
		});
	});

	it('adds a DNS inbound for the OpenWrt sing-box configuration', async () => {
		const env = createEnv({
			extraNodes: YAML.dump({ proxies: [] }),
			singBoxTemplate: JSON.stringify({ endpoints: [], inbounds: [{ type: 'tun' }], route: { rules: [] }, outbounds: [] }),
		});

		vi.stubGlobal('fetch', vi.fn(async () => new Response(YAML.dump({ proxies: [] }))));

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/wrt'),
			env,
		);
		const config = (await response.json()) as { endpoints: any[]; inbounds: any[] };

		expect(response.status).toBe(200);
		expect(config.endpoints).toEqual([]);
		expect(config.inbounds).toContainEqual({ type: 'direct', tag: 'dns-in', listen: '::', listen_port: 53 });
	});

	it('uses the Tailscale keys stored in D1 for standard and Admiral devices', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(YAML.dump({ proxies: [] }))));
		const env = createEnv();

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/iphone'),
			env,
		);
		const config = (await response.json()) as { endpoints: any[] };
		const admiralResponse = await worker.fetch(new Request('https://example.com/sing-box/admiralxs/router'), env);
		const admiralConfig = (await admiralResponse.json()) as { endpoints: any[]; route: { rules: any[] } };

		expect(response.status).toBe(200);
		expect(config.endpoints).toContainEqual({
			type: 'tailscale',
			tag: 'tailscale',
			auth_key: 'database-tailscale-key',
			hostname: 'eloxts-iphone-sing-box',
			accept_routes: true,
		});
		expect(admiralResponse.status).toBe(200);
		expect(admiralConfig.endpoints).toContainEqual({
			type: 'tailscale',
			tag: 'tailscale',
			auth_key: 'database-admiral-key',
			hostname: 'router-sing-box',
			accept_routes: true,
		});
		expect(admiralConfig.route.rules).toContainEqual({ ip_cidr: '10.0.0.0/24', outbound: 'tailscale' });
	});
});
