import { describe, expect, it } from "vitest";
import {
	normalizeProjectPrefix,
	normalizeRepo,
	projectIdError,
	projectPrefixError,
	repoError,
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

describe("normalizeRepo", () => {
	it("reduces a URL to host/owner/name", () => {
		expect(normalizeRepo("https://github.com/Ku6epXBOCTuK/xboct-log.git")).toBe(
			"github.com/Ku6epXBOCTuK/xboct-log",
		);
		expect(normalizeRepo("http://github.com/owner/repo/")).toBe(
			"github.com/owner/repo",
		);
	});

	it("accepts the scp and ssh forms", () => {
		expect(normalizeRepo("git@github.com:owner/repo.git")).toBe(
			"github.com/owner/repo",
		);
		expect(normalizeRepo("ssh://git@host:3000/owner/repo.git")).toBe(
			"host:3000/owner/repo",
		);
	});

	it("lowercases the host and keeps the path", () => {
		expect(normalizeRepo("GitHub.com/Owner/Repo")).toBe(
			"github.com/Owner/Repo",
		);
	});

	it("keeps subgroups", () => {
		expect(normalizeRepo("gitea.local/group/sub/repo")).toBe(
			"gitea.local/group/sub/repo",
		);
	});

	it("returns null for an empty value", () => {
		expect(normalizeRepo("")).toBeNull();
		expect(normalizeRepo("   ")).toBeNull();
	});
});

describe("repoError", () => {
	it("accepts a URL, a scp form and a plain host/owner/name", () => {
		expect(repoError("")).toBeNull();
		expect(repoError("https://github.com/owner/repo.git")).toBeNull();
		expect(repoError("git@github.com:owner/repo.git")).toBeNull();
		expect(repoError("github.com/owner/repo")).toBeNull();
	});

	it("rejects a missing host or name", () => {
		expect(repoError("owner/repo")).not.toBeNull();
		expect(repoError("https://github.com/owner")).not.toBeNull();
		expect(repoError("github.com")).not.toBeNull();
	});

	it("rejects traversal and stray characters", () => {
		expect(repoError("github.com/../repo")).not.toBeNull();
		expect(repoError("github.com/owner/re po")).not.toBeNull();
		expect(repoError("https://github.com/owner/repo?tab=1")).not.toBeNull();
	});

	it("rejects an overlong value", () => {
		expect(repoError(`github.com/owner/${"a".repeat(200)}`)).not.toBeNull();
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
