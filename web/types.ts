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
