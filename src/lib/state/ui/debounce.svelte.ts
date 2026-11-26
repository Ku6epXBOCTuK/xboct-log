export function createDebouncedValue<T>(initial: T, delay = 200) {
	let value = $state(initial);
	let applied = $state(initial);
	let timer: ReturnType<typeof setTimeout> | undefined;

	return {
		get value() {
			return value;
		},
		get applied() {
			return applied;
		},
		set(next: T) {
			value = next;
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => {
				timer = undefined;
				applied = next;
			}, delay);
		},
		cancel() {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
		apply(next: T) {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			value = next;
			applied = next;
		},
	};
}

export type DebouncedValue<T> = ReturnType<typeof createDebouncedValue<T>>;
