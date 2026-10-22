import { describe, expect, it } from "vitest";
import {
	normalizeProjectPrefix,
	projectIdError,
	projectPrefixError,
	slugifyProjectId,
	uniqueProjectId,
} from "./create";

describe("slugifyProjectId", () => {
	it("turns a name into a slug", () => {
		expect(slugifyProjectId("Music Player VSCode Ext")).toBe(
			"music-player-vscode-ext",
		);
		expect(slugifyProjectId("  Twitch Деревня ")).toBe("twitch");
	});

	it("drops the dashes at the edges", () => {
		expect(slugifyProjectId("--- hello ---")).toBe("hello");
		expect(slugifyProjectId("")).toBe("");
	});
});

describe("projectIdError", () => {
	it("accepts a slug", () => {
		expect(projectIdError("mcp-game")).toBeNull();
		expect(projectIdError("sw2")).toBeNull();
	});

	it("rejects an empty, broken or long id", () => {
		expect(projectIdError("")).not.toBeNull();
		expect(projectIdError("MCP Game")).not.toBeNull();
		expect(projectIdError("-game")).not.toBeNull();
		expect(projectIdError("a".repeat(41))).not.toBeNull();
	});
});

describe("projectPrefixError", () => {
	it("accepts 1-6 uppercase letters or digits", () => {
		expect(projectPrefixError("LOG")).toBeNull();
		expect(projectPrefixError("SW2")).toBeNull();
		expect(projectPrefixError("ABCDEF")).toBeNull();
	});

	it("rejects an empty, long or mixed prefix", () => {
		expect(projectPrefixError("")).not.toBeNull();
		expect(projectPrefixError("ABCDEFG")).not.toBeNull();
		expect(projectPrefixError("A-B")).not.toBeNull();
	});
});

describe("normalizeProjectPrefix", () => {
	it("trims and uppercases", () => {
		expect(normalizeProjectPrefix(" log ")).toBe("LOG");
	});
});

describe("uniqueProjectId", () => {
	it("keeps a free id", () => {
		expect(uniqueProjectId("mcp-game", ["xboct-log"])).toBe("mcp-game");
	});

	it("adds a counter to a taken id", () => {
		expect(uniqueProjectId("mcp-game", ["mcp-game"])).toBe("mcp-game-2");
		expect(uniqueProjectId("mcp-game", ["mcp-game", "mcp-game-2"])).toBe(
			"mcp-game-3",
		);
	});
});
