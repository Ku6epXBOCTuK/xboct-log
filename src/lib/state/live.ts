import { getProjects } from "#lib/remote/projects.remote.ts";
import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
import { getTasks } from "#lib/remote/tasks.remote.ts";
import type { ProjectStore } from "./projects.svelte.ts";
import type { ScopeStore } from "./scopes.svelte.ts";
import type { TaskStore } from "./tasks.svelte.ts";

const COALESCE_MS = 300;
const ENTITIES = ["tasks", "projects", "scopes"] as const;

type Entity = (typeof ENTITIES)[number];

interface LiveStores {
	tasks: TaskStore;
	projects: ProjectStore;
	scopes: ScopeStore;
}

async function loadScopes() {
	const ids = await getScopedProjectIds({});
	return (
		await Promise.all(ids.map((id) => getScopes({ project_id: id })))
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
					stores.tasks.replaceAll(await getTasks({ limit: 1000 }));
				}
				if (entities.has("projects")) {
					stores.projects.replaceAll(
						await getProjects({ includeArchived: true }),
					);
				}
				if (entities.has("scopes")) {
					stores.scopes.replaceAll(await loadScopes());
				}
			})
			.catch(() => {});
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
		const data = (event as MessageEvent<{ entity?: string }>).data;
		if (data && (ENTITIES as readonly string[]).includes(data.entity ?? "")) {
			schedule(data.entity as Entity);
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
