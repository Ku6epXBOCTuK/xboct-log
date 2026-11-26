export function createAttachmentFlash(delay = 2000) {
	let fresh = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function mark() {
		fresh = true;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			fresh = false;
			timer = null;
		}, delay);
	}

	function dispose() {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	}

	return {
		mark,
		dispose,
		get fresh() {
			return fresh;
		},
	};
}
