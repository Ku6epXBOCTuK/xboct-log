type Listener = (reachable: boolean) => void;

const listeners = new Set<Listener>();

export function watchReachability(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function reportReachable(): void {
	emit(true);
}

export function reportUnreachable(): void {
	emit(false);
}

function emit(reachable: boolean): void {
	for (const listener of [...listeners]) {
		listener(reachable);
	}
}
