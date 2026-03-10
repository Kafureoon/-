import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const publicDir = path.join(__dirname, "public");
const stateFile = path.join(repoRoot, "data", "admin", "customizer.state.json");
const footerHtmlFile = path.join(repoRoot, "src", "config", "FooterConfig.html");
const previewCacheDir = path.join(
	repoRoot,
	"data",
	"admin",
	"customizer-preview-cache",
);
const ffmpegBinary = process.env.FIREFLY_CUSTOMIZER_FFMPEG || "/usr/bin/ffmpeg";

const host = process.env.FIREFLY_CUSTOMIZER_HOST || "0.0.0.0";
const port = Number(process.env.FIREFLY_CUSTOMIZER_PORT || "3218");
const adminUsername = process.env.FIREFLY_CUSTOMIZER_USERNAME || "admin";
const adminPassword =
	process.env.FIREFLY_CUSTOMIZER_PASSWORD || "change-me-now";
const sessionTtlMs = 1000 * 60 * 60 * 12;
const sessions = new Map();

const imageExtensions = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".avif",
	".svg",
	".ico",
]);

const audioExtensions = new Set([
	".mp3",
	".wav",
	".ogg",
	".flac",
	".m4a",
	".aac",
]);

const uploadTargets = {
	avatar: {
		dir: path.join(repoRoot, "src", "assets", "images", "customizer"),
		pathBuilder: (filename) => `assets/images/customizer/${filename}`,
		type: "image",
	},
	navbarLogo: {
		dir: path.join(repoRoot, "src", "assets", "images", "customizer"),
		pathBuilder: (filename) => `assets/images/customizer/${filename}`,
		type: "image",
	},
	desktopWallpaper: {
		dir: path.join(repoRoot, "src", "assets", "images", "DesktopWallpaper"),
		pathBuilder: (filename) => `assets/images/DesktopWallpaper/${filename}`,
		type: "image",
	},
	mobileWallpaper: {
		dir: path.join(repoRoot, "src", "assets", "images", "MobileWallpaper"),
		pathBuilder: (filename) => `assets/images/MobileWallpaper/${filename}`,
		type: "image",
	},
	customImage: {
		dir: path.join(repoRoot, "src", "assets", "images", "customizer"),
		pathBuilder: (filename) => `assets/images/customizer/${filename}`,
		type: "image",
	},
	musicTrack: {
		dir: path.join(repoRoot, "public", "assets", "music"),
		pathBuilder: (filename) => `/assets/music/${filename}`,
		type: "audio",
	},
	musicCover: {
		dir: path.join(repoRoot, "public", "assets", "music", "cover"),
		pathBuilder: (filename) => `/assets/music/cover/${filename}`,
		type: "image",
	},
};

function sendJson(res, statusCode, payload) {
	res.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify(payload));
}

function sendText(
	res,
	statusCode,
	body,
	contentType = "text/plain; charset=utf-8",
) {
	res.writeHead(statusCode, {
		"Content-Type": contentType,
		"Cache-Control": "no-store",
	});
	res.end(body);
}

function parseCookies(req) {
	const header = req.headers.cookie || "";
	return Object.fromEntries(
		header
			.split(";")
			.map((item) => item.trim())
			.filter(Boolean)
			.map((item) => {
				const index = item.indexOf("=");
				return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
			}),
	);
}

function createSession() {
	const token = crypto.randomBytes(24).toString("hex");
	sessions.set(token, Date.now() + sessionTtlMs);
	return token;
}

function isAuthenticated(req) {
	const token = parseCookies(req).firefly_customizer_session;
	if (!token) return false;

	const expiresAt = sessions.get(token);
	if (!expiresAt || expiresAt < Date.now()) {
		sessions.delete(token);
		return false;
	}

	sessions.set(token, Date.now() + sessionTtlMs);
	return true;
}

async function readJsonBody(req, maxBytes = 30 * 1024 * 1024) {
	const chunks = [];
	let totalBytes = 0;

	for await (const chunk of req) {
		totalBytes += chunk.length;
		if (totalBytes > maxBytes) {
			throw new Error("请求体过大");
		}
		chunks.push(chunk);
	}

	if (!chunks.length) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function ensureParentDirectory(filePath) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readCustomizerState() {
	try {
		return JSON.parse(fs.readFileSync(stateFile, "utf8"));
	} catch (_error) {
		return {};
	}
}

function writeCustomizerState(state) {
	ensureParentDirectory(stateFile);
	fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readFooterHtml() {
	try {
		return fs.readFileSync(footerHtmlFile, "utf8");
	} catch (_error) {
		return "";
	}
}

function writeFooterHtml(content) {
	ensureParentDirectory(footerHtmlFile);
	fs.writeFileSync(footerHtmlFile, content, "utf8");
}

function classifyAssetPath(value) {
	if (typeof value !== "string" || !value.trim()) return null;
	const lower = value.toLowerCase();
	const extension = path.extname(lower.split("?")[0]);

	if (imageExtensions.has(extension)) return "image";
	if (audioExtensions.has(extension)) return "audio";

	if (
		lower.startsWith("assets/") ||
		lower.startsWith("/assets/") ||
		lower.startsWith("/pio/") ||
		lower.startsWith("/gallery/") ||
		lower.startsWith("/favicon/")
	) {
		return "file";
	}

	return null;
}

function buildAssetUrl(assetPath) {
	if (/^https?:\/\//i.test(assetPath)) {
		return assetPath;
	}
	return `/api/asset?path=${encodeURIComponent(assetPath)}`;
}

function buildPreviewUrl(
	assetPath,
	assetType = classifyAssetPath(assetPath),
) {
	if (/^https?:\/\//i.test(assetPath)) {
		return assetPath;
	}
	if (assetType === "image") {
		return `/api/asset-preview?path=${encodeURIComponent(assetPath)}`;
	}
	return buildAssetUrl(assetPath);
}

function formatBytes(sizeBytes) {
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB"];
	let value = sizeBytes;
	let index = 0;
	while (value >= 1024 && index < units.length - 1) {
		value /= 1024;
		index += 1;
	}
	return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function getAssetInfo(assetPath, assetType = classifyAssetPath(assetPath)) {
	const rawUrl = buildAssetUrl(assetPath);
	const previewUrl = buildPreviewUrl(assetPath, assetType);
	const info = {
		rawUrl,
		previewUrl,
		exists: null,
		sizeBytes: null,
		issue: "",
	};

	if (/^https?:\/\//i.test(assetPath)) {
		info.issue = "远程资源不会经过后台本地校验";
		return info;
	}

	const resolvedPath = resolveAssetPath(assetPath);
	if (!resolvedPath || !fs.existsSync(resolvedPath)) {
		info.exists = false;
		info.issue = "路径存在于配置里，但当前仓库里找不到这个文件";
		return info;
	}

	const stat = fs.statSync(resolvedPath);
	info.exists = true;
	info.sizeBytes = stat.size;
	if (assetType === "image" && stat.size >= 2 * 1024 * 1024) {
		info.issue = `原图较大（${formatBytes(stat.size)}），后台会自动使用缩略图预览`;
	}

	return info;
}

function createAssetRecord(trace, assetPath, assetType = classifyAssetPath(assetPath)) {
	return {
		trace,
		path: assetPath,
		type: assetType,
		...getAssetInfo(assetPath, assetType),
	};
}

function scanAssets(value, trace = "state", results = []) {
	if (typeof value === "string") {
		const assetType = classifyAssetPath(value);
		if (assetType) {
			results.push(createAssetRecord(trace, value, assetType));
		}
		return results;
	}

	if (Array.isArray(value)) {
		value.forEach((item, index) => scanAssets(item, `${trace}[${index}]`, results));
		return results;
	}

	if (value && typeof value === "object") {
		for (const [key, nestedValue] of Object.entries(value)) {
			scanAssets(nestedValue, `${trace}.${key}`, results);
		}
	}

	return results;
}

function isInsideRoot(baseDir, targetPath) {
	const relative = path.relative(baseDir, targetPath);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveAssetPath(assetPath) {
	if (/^https?:\/\//i.test(assetPath)) {
		return null;
	}

	let resolvedPath = null;
	if (assetPath.startsWith("/")) {
		resolvedPath = path.join(repoRoot, "public", assetPath.slice(1));
	} else if (assetPath.startsWith("assets/")) {
		resolvedPath = path.join(repoRoot, "src", assetPath);
	}

	if (!resolvedPath) {
		return null;
	}

	const normalizedPath = path.normalize(resolvedPath);
	if (!isInsideRoot(repoRoot, normalizedPath) && normalizedPath !== repoRoot) {
		return null;
	}

	return normalizedPath;
}

function detectContentType(filePath) {
	switch (path.extname(filePath).toLowerCase()) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".avif":
			return "image/avif";
		case ".svg":
			return "image/svg+xml";
		case ".ico":
			return "image/x-icon";
		case ".mp3":
			return "audio/mpeg";
		case ".wav":
			return "audio/wav";
		case ".ogg":
			return "audio/ogg";
		case ".m4a":
			return "audio/mp4";
		default:
			return "application/octet-stream";
	}
}

function getPreviewDimensions(urlObject) {
	const clamp = (value, fallback, minValue, maxValue) => {
		const parsed = Number.parseInt(value || "", 10);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.min(maxValue, Math.max(minValue, parsed));
	};

	return {
		width: clamp(urlObject.searchParams.get("w"), 640, 120, 1600),
		height: clamp(urlObject.searchParams.get("h"), 420, 120, 1200),
	};
}

async function getSharp() {
	return null;
}

function serveLocalFile(
	res,
	filePath,
	contentType = detectContentType(filePath),
) {
	const stat = fs.statSync(filePath);
	res.writeHead(200, {
		"Content-Type": contentType,
		"Content-Length": stat.size,
		"Cache-Control": "no-store",
	});
	fs.createReadStream(filePath).pipe(res);
}

function runProcess(binary, args, timeoutMs = 20000) {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, {
			cwd: repoRoot,
			env: process.env,
		});

		let stdout = "";
		let stderr = "";
		let finished = false;
		const timer = setTimeout(() => {
			if (finished) return;
			finished = true;
			child.kill("SIGKILL");
			reject(new Error(`${path.basename(binary)} 执行超时`));
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(
				new Error(
					stderr.trim() ||
						stdout.trim() ||
						`${path.basename(binary)} 退出码 ${code}`,
				),
			);
		});
	});
}

async function ensurePreviewImage(resolvedPath, width, height) {
	const stat = fs.statSync(resolvedPath);
	const ext = path.extname(resolvedPath).toLowerCase();
	if (!imageExtensions.has(ext) || ext === ".svg" || ext === ".ico") {
		return { filePath: resolvedPath, contentType: detectContentType(resolvedPath) };
	}

	const cacheKey = crypto
		.createHash("sha1")
		.update(`${resolvedPath}|${stat.mtimeMs}|${stat.size}|${width}|${height}`)
		.digest("hex");
	const previewPath = path.join(previewCacheDir, `${cacheKey}.png`);

	if (!fs.existsSync(previewPath)) {
		ensureParentDirectory(previewPath);
		await runProcess(ffmpegBinary, [
			"-y",
			"-i",
			resolvedPath,
			"-vf",
			`scale=${width}:${height}:force_original_aspect_ratio=decrease`,
			"-frames:v",
			"1",
			previewPath,
		]);
	}

	return {
		filePath: previewPath,
		contentType: "image/png",
	};
}

function sanitizeFilename(originalName, expectedType) {
	const extension = path.extname(originalName).toLowerCase();
	const allowedSet = expectedType === "audio" ? audioExtensions : imageExtensions;
	if (!allowedSet.has(extension)) {
		throw new Error("上传文件格式不受支持");
	}

	const rawBase = path.basename(originalName, extension);
	const safeBase =
		rawBase
			.normalize("NFKD")
			.replace(/[^\w.-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "asset";

	return `${Date.now()}-${safeBase}${extension}`;
}

function buildStateResponse() {
	const state = readCustomizerState();
	const footerHtml = readFooterHtml();
	const assetUsage = scanAssets({ ...state, footerHtml }).filter(
		(item, index, list) =>
			list.findIndex(
				(candidate) =>
					candidate.trace === item.trace && candidate.path === item.path,
			) === index,
	);

	return {
		state,
		footerHtml,
		assetUsage,
		info: {
			repoRoot,
			stateFile,
			footerHtmlFile,
			publishCommands: [
				"firefly-check",
				"firefly-build",
				"tools/firefly-customizer/publish.sh",
			],
			publishModes: {
				quick: ["tools/firefly-customizer/publish.sh"],
				full: [
					"firefly-check",
					"firefly-build",
					"tools/firefly-customizer/publish.sh",
				],
			},
		},
	};
}

function runShellCommand(command) {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		const child = spawn("/bin/sh", ["-lc", command], {
			cwd: repoRoot,
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("close", (code) => {
			resolve({
				code,
				stdout,
				stderr,
				elapsedMs: Date.now() - startedAt,
			});
		});
	});
}

function buildPublishPlan(mode, message) {
	const normalizedMode = mode === "full" ? "full" : "quick";

	if (normalizedMode === "full") {
		return {
			mode: normalizedMode,
			message: "完整检查、构建和发布都已经完成。",
			commands: [
				{ label: "firefly-check", command: "firefly-check" },
				{ label: "firefly-build", command: "firefly-build" },
				{
					label: "firefly-customizer-publish",
					command: `sh tools/firefly-customizer/publish.sh ${JSON.stringify(message)}`,
				},
			],
		};
	}

	return {
		mode: normalizedMode,
		message: "已经推送到 GitHub，GitHub Pages 会自动继续构建和发布。",
		commands: [
			{
				label: "firefly-customizer-publish",
				command: `sh tools/firefly-customizer/publish.sh ${JSON.stringify(message)}`,
			},
		],
	};
}

async function servePublicFile(res, pathname) {
	const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
	const absolutePath = path.join(publicDir, relativePath);
	const normalizedPath = path.normalize(absolutePath);

	if (
		(!isInsideRoot(publicDir, normalizedPath) && normalizedPath !== publicDir) ||
		!fs.existsSync(normalizedPath)
	) {
		sendText(res, 404, "Not Found");
		return;
	}

	res.writeHead(200, {
		"Content-Type": detectContentType(normalizedPath),
		"Cache-Control": "no-store",
	});
	fs.createReadStream(normalizedPath).pipe(res);
}

export const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
	const pathname = url.pathname;

	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		});
		res.end();
		return;
	}

	try {
		if (pathname === "/health") {
			sendJson(res, 200, { ok: true });
			return;
		}

		if (pathname === "/api/login" && req.method === "POST") {
			const body = await readJsonBody(req, 1024 * 1024);
			if (
				body.username !== adminUsername ||
				body.password !== adminPassword
			) {
				sendJson(res, 401, { error: "账号或密码不正确" });
				return;
			}

			const token = createSession();
			res.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
				"Set-Cookie": `firefly_customizer_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
				"Cache-Control": "no-store",
			});
			res.end(JSON.stringify({ ok: true }));
			return;
		}

		if (pathname === "/api/logout" && req.method === "POST") {
			const token = parseCookies(req).firefly_customizer_session;
			if (token) {
				sessions.delete(token);
			}
			res.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
				"Set-Cookie":
					"firefly_customizer_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
				"Cache-Control": "no-store",
			});
			res.end(JSON.stringify({ ok: true }));
			return;
		}

		if (pathname.startsWith("/api/") && !isAuthenticated(req)) {
			sendJson(res, 401, { error: "未登录或登录已过期" });
			return;
		}

		if (pathname === "/api/state" && req.method === "GET") {
			sendJson(res, 200, buildStateResponse());
			return;
		}

		if (pathname === "/api/save" && req.method === "POST") {
			const body = await readJsonBody(req);
			if (!body || typeof body !== "object" || !body.state) {
				sendJson(res, 400, { error: "缺少 state 数据" });
				return;
			}

			writeCustomizerState(body.state);
			writeFooterHtml(typeof body.footerHtml === "string" ? body.footerHtml : "");
			sendJson(res, 200, {
				ok: true,
				message: "配置已保存到仓库工作区，线上站点还没有发布更新。",
				...buildStateResponse(),
			});
			return;
		}

		if (pathname === "/api/upload" && req.method === "POST") {
			const body = await readJsonBody(req, 40 * 1024 * 1024);
			const target = uploadTargets[body.target];
			if (!target) {
				sendJson(res, 400, { error: "未知的上传目标" });
				return;
			}

			if (
				typeof body.filename !== "string" ||
				typeof body.contentBase64 !== "string"
			) {
				sendJson(res, 400, { error: "上传参数不完整" });
				return;
			}

			const filename = sanitizeFilename(body.filename, target.type);
			const outputPath = path.join(target.dir, filename);
			ensureParentDirectory(outputPath);
			fs.writeFileSync(outputPath, Buffer.from(body.contentBase64, "base64"));

			const configPath = target.pathBuilder(filename);
			sendJson(res, 200, {
				ok: true,
				path: configPath,
				type: target.type,
				rawUrl: buildAssetUrl(configPath),
				previewUrl: buildPreviewUrl(configPath, target.type),
				...getAssetInfo(configPath, target.type),
			});
			return;
		}

		if (pathname === "/api/asset" && req.method === "GET") {
			const assetPath = url.searchParams.get("path");
			if (!assetPath) {
				sendText(res, 400, "Missing path");
				return;
			}

			if (/^https?:\/\//i.test(assetPath)) {
				sendText(res, 400, "Remote assets should be loaded directly.");
				return;
			}

			const resolvedPath = resolveAssetPath(assetPath);
			if (!resolvedPath || !fs.existsSync(resolvedPath)) {
				sendText(res, 404, "Asset not found");
				return;
			}

			serveLocalFile(res, resolvedPath);
			return;
		}

		if (pathname === "/api/asset-preview" && req.method === "GET") {
			const assetPath = url.searchParams.get("path");
			if (!assetPath) {
				sendText(res, 400, "Missing path");
				return;
			}

			if (/^https?:\/\//i.test(assetPath)) {
				sendText(res, 400, "Remote assets should be loaded directly.");
				return;
			}

			const resolvedPath = resolveAssetPath(assetPath);
			if (!resolvedPath || !fs.existsSync(resolvedPath)) {
				sendText(res, 404, "Asset not found");
				return;
			}

			const { width, height } = getPreviewDimensions(url);
			try {
				const preview = await ensurePreviewImage(resolvedPath, width, height);
				serveLocalFile(res, preview.filePath, preview.contentType);
			} catch (error) {
				console.warn(
					`[firefly-customizer] preview fallback for ${assetPath}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				serveLocalFile(res, resolvedPath);
			}
			return;
		}

		if (pathname === "/api/publish" && req.method === "POST") {
			const body = await readJsonBody(req, 1024 * 1024);
			const message =
				typeof body.message === "string" && body.message.trim()
					? body.message.trim()
					: "chore: publish admin customizer update";
			const plan = buildPublishPlan(body.mode, message);
			const commands = plan.commands;

			const logs = [];
			for (const item of commands) {
				const result = await runShellCommand(item.command);
				logs.push({
					label: item.label,
					...result,
				});
				if (result.code !== 0) {
					sendJson(res, 500, {
						ok: false,
						error: `${item.label} 执行失败`,
						logs,
					});
					return;
				}
			}

			sendJson(res, 200, {
				ok: true,
				mode: plan.mode,
				message: plan.message,
				logs,
				...buildStateResponse(),
			});
			return;
		}

		if (
			pathname === "/" ||
			pathname === "/app.js" ||
			pathname === "/styles.css"
		) {
			await servePublicFile(res, pathname);
			return;
		}

		sendText(res, 404, "Not Found");
	} catch (error) {
		sendJson(res, 500, {
			error: error instanceof Error ? error.message : "服务端发生未知错误",
		});
	}
});

server.listen(port, host, () => {
	console.log(
		`[firefly-customizer] listening on http://${host}:${port} (repo: ${repoRoot})`,
	);
	console.log(`[firefly-customizer] admin user: ${adminUsername}`);
});
