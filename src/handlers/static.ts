export async function handleStatic(path: string, bucket: R2Bucket): Promise<Response> {
	const key = path.replace('/2774d2d9-d46b-4819-be0e-3d654270efcd/', '');
	const object = await bucket.get(key);
	if (!object) return new Response('Not Found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	return new Response(object.body, { headers });
}
