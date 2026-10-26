import { fetchFresh } from "#lib/remote/fresh.ts";
import { getProjects } from "#lib/remote/projects.remote.ts";
import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
import { getTasks } from "#lib/remote/tasks.remote.ts";
import { TASK_SNAPSHOT_LIMIT } from "#lib/tasks/snapshot.ts";
import type { CommentsStore } from "./comments.svelte.ts";
import type { ProjectStore } from "./projects.svelte.ts";
import type { ScopeStore } from "./scopes.svelte.ts";
import type { TagStore } from "./tags.svelte.ts";
import type { TaskStore } from "./tasks.svelte.ts";

const COALESCE_MS = 300;
const ENTITIES = ["tasks", "projects", "scopes"] as const;

type Entity = (typeof ENTITIES)[number];

interface LiveStores {
	tasks: TaskStore;
	projects: ProjectStore;
	scopes: ScopeStore;
	tags: TagStore;
	comments: CommentsStore;
}

async function loadScopes() {
	const ids = await fetchFresh(getScopedProjectIds({}));
	return (
		await Promise.all(
			ids.map((id) => fetchFresh(getScopes({ project_id: id }))),
		)
	).flat();
}

export function startLiveSync(stores: LiveStores): () => void {
	const source = new EventSource("/api/events");
	const pending = new Set<Entity>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let queue: Promise<void> = Promise.resolve();

	function flush(): void {
		const entities = new Set(pending);
		pending.clear();
		queue = queue
			.then(async () => {
				if (entities.has("tasks")) {
					try {
						const { items, total } = await fetchFresh(
							getTasks({
								limit: TASK_SNAPSHOT_LIMIT,
								include_description: true,
							}),
						);
						stores.tasks.replaceAll(items, total);
					} catch (error) {
						console.warn("[live] tasks reload failed", error);
					}
					try {
						await stores.tags.refresh();
					} catch (error) {
						console.warn("[live] tags reload failed", error);
					}
					try {
						await stores.comments.refresh();
					} catch (error) {
						console.warn("[live] comments reload failed", error);
					}
				}
				if (entities.has("projects")) {
					const next = await fetchFresh(getProjects({ includeArchived: true }));
					stores.projects.replaceAll(next);
				}
				if (entities.has("scopes")) {
					const next = await loadScopes();
					stores.scopes.replaceAll(next);
				}
			})
			.catch((error) => {
				console.warn("[live] reload failed", error);
			});
	}

	function schedule(entity: Entity): void {
		pending.add(entity);
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			flush();
		}, COALESCE_MS);
	}

	function scheduleAll(): void {
		for (const entity of ENTITIES) {
			schedule(entity);
		}
	}

	source.addEventListener("change", (event) => {
		const raw = (event as MessageEvent<string>).data;
		let entity: string | undefined;
		try {
			entity = (JSON.parse(raw) as { entity?: string }).entity;
		} catch {
			entity = undefined;
		}
		if (entity && (ENTITIES as readonly string[]).includes(entity)) {
			schedule(entity as Entity);
		}
	});
	source.addEventListener("sync", scheduleAll);

	function handleVisibility(): void {
		if (document.visibilityState === "visible") {
			scheduleAll();
		}
	}
	document.addEventListener("visibilitychange", handleVisibility);

	return () => {
		source.close();
		document.removeEventListener("visibilitychange", handleVisibility);
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	};
}
