function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeSiteUrl(value?: string): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return trimTrailingSlash(trimmed);
}

function normalizeBasePath(value?: string): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "/") return "/";
	const normalized = trimmed.replace(/^\/+|\/+$/g, "");
	return normalized ? `/${normalized}/` : "/";
}

function getGithubPagesDefaults() {
	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) return undefined;

	const [owner, repo] = repository.split("/");
	if (!owner || !repo) return undefined;

	const isUserOrOrgSite =
		repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
	const basePath = isUserOrOrgSite ? "/" : `/${repo}/`;
	const siteUrl = `https://${owner}.github.io${isUserOrOrgSite ? "" : `/${repo}`}`;

	return {
		basePath,
		siteUrl,
	};
}

const explicitSiteUrl = normalizeSiteUrl(
	process.env.PUBLIC_SITE_URL || process.env.SITE_URL,
);
const explicitBasePath = normalizeBasePath(
	process.env.PUBLIC_BASE_PATH || process.env.BASE_PATH,
);
const githubPagesDefaults = getGithubPagesDefaults();

export const deployBasePath =
	explicitBasePath || githubPagesDefaults?.basePath || "/";

export function resolveSiteUrl(fallback: string): string {
	return (
		explicitSiteUrl ||
		githubPagesDefaults?.siteUrl ||
		normalizeSiteUrl(fallback) ||
		fallback
	);
}
