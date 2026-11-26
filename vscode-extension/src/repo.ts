import { execFile } from "node:child_process";
import * as vscode from "vscode";

const GIT_TIMEOUT_MS = 3000;

function gitRemotes(folder: vscode.WorkspaceFolder): Promise<string[]> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["-C", folder.uri.fsPath, "remote", "-v"],
			{ timeout: GIT_TIMEOUT_MS, windowsHide: true },
			(error, stdout) => {
				if (error) {
					resolve([]);
					return;
				}
				const keys = stdout
					.split(/\r?\n/)
					.map((line) => repoKey(line.split(/\s+/)[1] ?? ""))
					.filter((key): key is string => key !== null);
				resolve(keys);
			},
		);
	});
}

function repoKey(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(trimmed);
	let rest = scheme === null ? trimmed : trimmed.slice(scheme[0].length);
	if (scheme === null) {
		const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(rest);
		if (scp !== null) rest = `${scp[1]}/${scp[2]}`;
	}
	const slash = rest.indexOf("/");
	if (slash === -1) return null;
	const host = rest.slice(0, slash).replace(/^.*@/, "").toLowerCase();
	const path = rest
		.slice(slash + 1)
		.replace(/\/+$/, "")
		.replace(/\.git$/i, "")
		.replace(/\/+$/, "");
	if (host === "" || path === "") return null;
	return `${host}/${path}`.toLowerCase();
}

async function repoFolder(
	repo: string,
): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) return undefined;
	const wanted = repoKey(repo);
	if (wanted !== null) {
		for (const folder of folders) {
			const remotes = await gitRemotes(folder);
			if (remotes.includes(wanted)) return folder;
		}
	}
	return folders.length === 1 ? folders[0] : undefined;
}

function relativeSegments(path: string): string[] | null {
	const segments = path
		.split("/")
		.filter((part) => part !== "" && part !== ".");
	if (segments.length === 0) return null;
	if (
		segments.some(
			(part) => part === ".." || part.includes("\\") || part.includes(":"),
		)
	) {
		return null;
	}
	return segments;
}

export async function openRepoFile(repo: string, path: string): Promise<void> {
	if (path === "") return;
	const segments = relativeSegments(path);
	if (segments === null) {
		void vscode.window.showWarningMessage(
			`Xboct Log: ${path} points outside the repository`,
		);
		return;
	}
	const folder = await repoFolder(repo);
	if (folder === undefined) {
		void vscode.window.showWarningMessage(
			`Xboct Log: no workspace folder matches ${repo === "" ? "the link" : repo}`,
		);
		return;
	}
	const uri = vscode.Uri.joinPath(folder.uri, ...segments);
	let type: vscode.FileType | undefined;
	try {
		type = (await vscode.workspace.fs.stat(uri)).type;
	} catch {
		type = undefined;
	}
	if (type === undefined || (type & vscode.FileType.File) === 0) {
		void vscode.window.showWarningMessage(
			`Xboct Log: ${path} is not a file in ${folder.name}`,
		);
		return;
	}
	await vscode.window.showTextDocument(uri, { preview: true });
}
