export function createAttachmentNotice(delay = 4000, denialDelay = 2500) {
	let message = $state("");
	let denied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let denialTimer: ReturnType<typeof setTimeout> | null = null;

	function clear() {
		if (timer !== null) clearTimeout(timer);
		if (denialTimer !== null) clearTimeout(denialTimer);
		timer = null;
		denialTimer = null;
		message = "";
		denied = false;
	}

	function show(next: string) {
		if (next === "") return;
		message = next;
		denied = true;
		if (timer !== null) clearTimeout(timer);
		if (denialTimer !== null) clearTimeout(denialTimer);
		timer = setTimeout(() => {
			message = "";
			timer = null;
		}, delay);
		denialTimer = setTimeout(() => {
			denied = false;
			denialTimer = null;
		}, denialDelay);
	}

	function dispose() {
		if (timer !== null) clearTimeout(timer);
		if (denialTimer !== null) clearTimeout(denialTimer);
		timer = null;
		denialTimer = null;
	}

	return {
		show,
		clear,
		dispose,
		get message() {
			return message;
		},
		get denied() {
			return denied;
		},
	};
}
