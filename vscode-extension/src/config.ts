import * as vscode from "vscode";

export const VIEW_TYPE = "xboctLog";
export const APP_NAME = "xboct-log";
export const DEFAULT_SERVER_URL = "http://127.0.0.1:45881";

export function configuration(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(VIEW_TYPE);
}

export function serverUrl(): string {
	const configured = configuration().get<string>(
		"serverUrl",
		DEFAULT_SERVER_URL,
	);

	return configured.replace(/\/+$/, "");
}

export function portFromUrl(): string {
	try {
		return new URL(serverUrl()).port || "45881";
	} catch {
		return "45881";
	}
}

export function frameOrigin(): string {
	try {
		return new URL(serverUrl()).origin;
	} catch {
		return serverUrl();
	}
}

export function autoStart(): boolean {
	return configuration().get<boolean>("autoStart", true);
}

export function currentTheme(): "light" | "dark" {
	const kind = vscode.window.activeColorTheme.kind;
	const light =
		kind === vscode.ColorThemeKind.Light ||
		kind === vscode.ColorThemeKind.HighContrastLight;

	return light ? "light" : "dark";
}
