import { describe, expect, it, vi } from "vitest";
import { createSelect } from "./select.svelte.ts";

interface Item {
	id: string;
	label: string;
	keywords?: string;
}

const items: Item[] = [
	{ id: "LOG-1", label: "Мелкие ui правки", keywords: "epic" },
	{ id: "LOG-2", label: "Select component" },
	{ id: "LOG-3", label: "sorting" },
];

function make(onPick = vi.fn()) {
	const select = createSelect<Item>({
		items: () => items,
		getLabel: (item) => item.label,
		getKeywords: (item) => item.keywords ?? "",
		onPick,
	});
	return { select, onPick };
}

function key(value: string): KeyboardEvent {
	return { key: value } as KeyboardEvent;
}

describe("createSelect", () => {
	it("starts closed with every item visible", () => {
		const { select } = make();

		expect(select.open).toBe(false);
		expect(select.filtered).toEqual(items);
	});

	it("filters by label case-insensitively", () => {
		const { select } = make();

		select.setQuery("SELECT");

		expect(select.filtered.map((item) => item.id)).toEqual(["LOG-2"]);
	});

	it("filters by keywords", () => {
		const { select } = make();

		select.setQuery("epic");

		expect(select.filtered.map((item) => item.id)).toEqual(["LOG-1"]);
	});

	it("exposes no active item when nothing matches", () => {
		const { select } = make();

		select.setQuery("zzz");

		expect(select.filtered).toEqual([]);
		expect(select.active).toBeNull();
	});

	it("resets the query when opened", () => {
		const { select } = make();

		select.setQuery("select");
		select.show();

		expect(select.open).toBe(true);
		expect(select.query).toBe("");
		expect(select.filtered).toEqual(items);
	});

	it("toggles open and closed", () => {
		const { select } = make();

		select.toggle();
		expect(select.open).toBe(true);

		select.toggle();
		expect(select.open).toBe(false);
	});

	it("notifies open and close once per transition", () => {
		const onOpen = vi.fn();
		const onClose = vi.fn();
		const select = createSelect<Item>({
			items: () => items,
			getLabel: (item) => item.label,
			onPick: vi.fn(),
			onOpen,
			onClose,
		});

		select.show();
		select.show();
		select.hide();
		select.hide();

		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("wraps the active index in both directions", () => {
		const { select } = make();

		select.show();
		select.move(-1);
		expect(select.active?.id).toBe("LOG-3");

		select.move(1);
		expect(select.active?.id).toBe("LOG-1");
	});

	it("moves to the edges with home and end", () => {
		const { select } = make();

		select.show();
		expect(select.handleKeydown(key("End"))).toBe(true);
		expect(select.active?.id).toBe("LOG-3");

		expect(select.handleKeydown(key("Home"))).toBe(true);
		expect(select.active?.id).toBe("LOG-1");
	});

	it("opens on arrow down when closed", () => {
		const { select } = make();

		expect(select.handleKeydown(key("ArrowDown"))).toBe(true);
		expect(select.open).toBe(true);
		expect(select.active?.id).toBe("LOG-1");
	});

	it("picks the active item on enter", () => {
		const { select, onPick } = make();

		select.show();
		select.move(1);

		expect(select.handleKeydown(key("Enter"))).toBe(true);
		expect(onPick).toHaveBeenCalledWith(items[1]);
	});

	it("picks a specific item directly", () => {
		const { select, onPick } = make();

		select.pick(items[2]);

		expect(onPick).toHaveBeenCalledWith(items[2]);
	});

	it("ignores enter when nothing matches", () => {
		const { select, onPick } = make();

		select.show();
		select.setQuery("zzz");

		expect(select.handleKeydown(key("Enter"))).toBe(false);
		expect(onPick).not.toHaveBeenCalled();
	});

	it("closes on escape and reports the key as handled", () => {
		const { select } = make();

		select.show();

		expect(select.handleKeydown(key("Escape"))).toBe(true);
		expect(select.open).toBe(false);
	});

	it("leaves escape unhandled when closed", () => {
		const { select } = make();

		expect(select.handleKeydown(key("Escape"))).toBe(false);
	});

	it("ignores movement when the list is empty", () => {
		const { select } = make();

		select.show();
		select.setQuery("zzz");
		select.move(1);

		expect(select.active).toBeNull();
	});

	it("closes after picking by default", () => {
		const { select } = make();

		select.show();
		select.pick(items[0]);

		expect(select.open).toBe(false);
	});

	it("stays open after picking when asked to", () => {
		const onPick = vi.fn();
		const select = createSelect<Item>({
			items: () => items,
			getLabel: (item) => item.label,
			onPick,
			closeOnPick: false,
		});

		select.show();
		select.pick(items[0]);

		expect(onPick).toHaveBeenCalledWith(items[0]);
		expect(select.open).toBe(true);
	});
});
