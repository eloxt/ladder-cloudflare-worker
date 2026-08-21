export interface Env {
	STATIC_BUCKET: R2Bucket;
	YECAO_PROVIDER_URL: string;
	LIANGXIN_PROVIDER_URL: string;
	XFLASH_PROVIDER_URL: string;
	TAILSCALE_AUTH_KEY: string;
	TAILSCALE_ADMIRAL_AUTH_KEY?: string;
	DAE_GEOSITE_FILE?: string;
	DAE_GEOIP_FILE?: string;
	DAE_BLOCK_TAGS?: string;
	DAE_DIRECT_TAGS?: string;
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
