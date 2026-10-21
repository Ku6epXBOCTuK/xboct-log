import { describe, expect, it } from "vitest";
import { isTypingTarget, matchesHotkey, type HotkeyEvent } from "./hotkeys";

function key(init: Partial<HotkeyEvent> & { key: string }): HotkeyEvent {
	return {
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		metaKey: false,
		...init,
	};
}

describe("matchesHotkey", () => {
	it("matches a plain key", () => {
		expect(matchesHotkey(key({ key: "n" }), "n")).toBe(true);
		expect(matchesHotkey(key({ key: "/" }), "/")).toBe(true);
	});

	it("does not match a plain key with modifiers", () => {
		expect(matchesHotkey(key({ key: "n", ctrlKey: true }), "n")).toBe(false);
		expect(matchesHotkey(key({ key: "N", shiftKey: true }), "n")).toBe(false);
	});

	it("matches a combination", () => {
		expect(
			matchesHotkey(
				key({ key: "c", ctrlKey: true, altKey: true }),
				"ctrl+alt+c",
			),
		).toBe(true);
		expect(
			matchesHotkey(key({ key: "c", ctrlKey: true, altKey: true }), "ctrl+c"),
		).toBe(false);
		expect(
			matchesHotkey(
				key({ key: "Enter", ctrlKey: true, shiftKey: true }),
				"ctrl+shift+enter",
			),
		).toBe(true);
	});

	it("ignores an empty combo", () => {
		expect(matchesHotkey(key({ key: "n" }), "")).toBe(false);
	});

	it("matches the same physical key in a russian layout", () => {
		expect(matchesHotkey(key({ key: "т", code: "KeyN" }), "n")).toBe(true);
		expect(
			matchesHotkey(
				key({ key: "с", code: "KeyC", ctrlKey: true, altKey: true }),
				"ctrl+alt+c",
			),
		).toBe(true);
		expect(matchesHotkey(key({ key: "/", code: "Period" }), "/")).toBe(true);
	});

	it("does not match another key of a russian layout", () => {
		expect(matchesHotkey(key({ key: "н", code: "KeyY" }), "n")).toBe(false);
	});
});

describe("isTypingTarget", () => {
	it("detects text inputs", () => {
		expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(
			true,
		);
		expect(
			isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget),
		).toBe(true);
		expect(
			isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget),
		).toBe(true);
	});

	it("detects an editable element", () => {
		expect(
			isTypingTarget({
				tagName: "DIV",
				isContentEditable: true,
			} as unknown as EventTarget),
		).toBe(true);
	});

	it("ignores other elements", () => {
		expect(isTypingTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(
			false,
		);
		expect(isTypingTarget(null)).toBe(false);
	});
});
