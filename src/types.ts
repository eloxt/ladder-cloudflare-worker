export interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	ADMIN_PASSWORD?: string;
	DAE_GEOSITE_FILE?: string;
	DAE_GEOIP_FILE?: string;
	DAE_BLOCK_TAGS?: string;
	DAE_DIRECT_TAGS?: string;
}

export interface ProviderConfig {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	addFlag?: boolean;
}

export interface AppConfig {
	providers: ProviderConfig[];
	extraNodes: string;
	tailscaleAuthKey: string;
	tailscaleAdmiralAuthKey: string;
	clashTemplate: string;
	singBoxTemplate: string;
	updatedAt: string | null;
}

export interface ProxyNode {
	name: string;
	type: string;
	server: string;
	port: number;
	password?: string;
	uuid?: string;
	sni?: string;
	servername?: string;
	tls?: boolean;
	flow?: string;
	network?: string;
	'ws-opts'?: {
		path?: string;
		headers?: Record<string, string>;
	};
	'grpc-opts'?: {
		'grpc-service-name'?: string;
	};
	'reality-opts'?: {
		'public-key'?: string;
		'short-id'?: string;
	};
	'client-fingerprint'?: string;
	'skip-cert-verify'?: boolean;
	[key: string]: any;
}
