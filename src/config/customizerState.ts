import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const CUSTOMIZER_STATE_FILE = path.join(
	process.cwd(),
	"data",
	"admin",
	"customizer.state.json",
);

type CachedCustomizerState = {
	mtimeMs: number;
	state: JsonRecord;
};

const cacheStore = globalThis as typeof globalThis & {
	__fireflyCustomizerCache?: CachedCustomizerState;
};

function isPlainObject(value: unknown): value is JsonRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function readCustomizerStateFile(): JsonRecord {
	try {
		const stats = fs.statSync(CUSTOMIZER_STATE_FILE);
		const cached = cacheStore.__fireflyCustomizerCache;
		if (cached && cached.mtimeMs === stats.mtimeMs) {
			return cached.state;
		}

		const raw = fs.readFileSync(CUSTOMIZER_STATE_FILE, "utf8");
		const parsed = JSON.parse(raw);
		const state = isPlainObject(parsed) ? parsed : {};
		cacheStore.__fireflyCustomizerCache = {
			mtimeMs: stats.mtimeMs,
			state,
		};
		return state;
	} catch (_error) {
		return {};
	}
}

function deepMerge<T>(defaults: T, override: unknown): T {
	if (override === undefined) {
		return defaults;
	}

	if (Array.isArray(defaults)) {
		return (Array.isArray(override) ? override : defaults) as T;
	}

	if (isPlainObject(defaults) && isPlainObject(override)) {
		const merged: JsonRecord = { ...defaults };
		for (const [key, value] of Object.entries(override)) {
			merged[key] = key in defaults ? deepMerge(merged[key], value) : value;
		}
		return merged as T;
	}

	return override as T;
}

export function loadCustomizerSection<T>(sectionKey: string, defaults: T): T {
	const state = readCustomizerStateFile();
	return deepMerge(defaults, state[sectionKey]);
}

export function getCustomizerStateFilePath(): string {
	return CUSTOMIZER_STATE_FILE;
}
