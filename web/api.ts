export class ApiError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
	}
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, init);
	const body = (await response.json()) as T & { error?: string };
	if (!response.ok) throw new ApiError(body.error || '请求失败', response.status);
	return body;
}
