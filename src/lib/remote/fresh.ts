export interface RefreshableQuery<T> {
	refresh: () => Promise<void>;
	current: T | undefined;
}

// NOTE: a remote query caches its result on the client by payload, so
// awaiting the query again returns the cached value. Refreshing first forces a
// new request to the server, and the fresh value lands in `current`.
export async function fetchFresh<T>(query: RefreshableQuery<T>): Promise<T> {
	await query.refresh();
	return query.current as T;
}
