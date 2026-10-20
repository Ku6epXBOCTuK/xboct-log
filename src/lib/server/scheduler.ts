import { backupConfig, catchUp, reportBackup, runScheduled } from "./backup";
import { getDb } from "./db";
import { purgeSoftDeletedTasks } from "./purge";

interface SchedulerGlobal {
	__xboctLogSchedulerStarted?: boolean;
}

// NOTE: a module-level flag is not enough because SvelteKit reloads server
// modules in dev without restarting the process, which would stack timers.
function claimScheduler(): boolean {
	const scope = globalThis as SchedulerGlobal;
	if (scope.__xboctLogSchedulerStarted) {
		return false;
	}
	scope.__xboctLogSchedulerStarted = true;
	return true;
}

function scheduledFor(hour: number, minute: number, now: Date): Date {
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		hour,
		minute,
		0,
		0,
	);
}

function msUntilNext(hour: number, minute: number, now: Date): number {
	const next = scheduledFor(hour, minute, now);
	if (next.getTime() <= now.getTime()) {
		next.setDate(next.getDate() + 1);
	}
	return next.getTime() - now.getTime();
}

function runPurge(): void {
	try {
		const purged = purgeSoftDeletedTasks(getDb());
		if (purged > 0) {
			console.log(`[purge] removed ${purged} soft-deleted tasks`);
		}
	} catch (error) {
		console.warn("[purge] failed", error);
	}
}

export function startScheduler(): void {
	const config = backupConfig();
	if (!claimScheduler()) {
		return;
	}

	const runJobs = (label: string) => {
		void runScheduled(getDb(), config).then((result) =>
			reportBackup(label, result),
		);
		runPurge();
	};
	const schedule = () => {
		const timer = setTimeout(
			() => {
				runJobs("scheduled");
				schedule();
			},
			msUntilNext(config.hour, config.minute, new Date()),
		);
		timer.unref();
	};

	void catchUp(getDb(), config).then((result) =>
		reportBackup("catch-up", result),
	);
	schedule();
}
