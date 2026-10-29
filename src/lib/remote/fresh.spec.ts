import { describe, expect, it, vi } from "vitest";
import { fetchFresh, type RefreshableQuery } from "./fresh.ts";

function query<T>(initial: T) {
	const refresh = vi.fn(async () => {});
	const ref: RefreshableQuery<T> & { current: T | undefined } = {
		refresh,
		current: initial,
	};
	return { ref, refresh };
}

describe("fetchFresh", () => {
	it("refreshes once and returns the value that landed in current", async () => {
		const { ref, refresh } = query("cached");
		refresh.mockImplementation(async () => {
			ref.current = "fresh";
		});

		await expect(fetchFresh(ref)).resolves.toBe("fresh");
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("does not read current before the refresh settles", async () => {
		const { ref, refresh } = query("cached");
		let release: () => void = () => {};
		refresh.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = () => {
						ref.current = "fresh";
						resolve();
					};
				}),
		);

		const pending = fetchFresh(ref);
		expect(ref.current).toBe("cached");

		release();
		await expect(pending).resolves.toBe("fresh");
	});

	it("propagates a failed refresh and keeps the old value", async () => {
		const { ref, refresh } = query("cached");
		refresh.mockRejectedValue(new Error("offline"));

		await expect(fetchFresh(ref)).rejects.toThrow("offline");
		expect(ref.current).toBe("cached");
	});
});
