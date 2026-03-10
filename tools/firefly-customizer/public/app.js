const app = document.querySelector("#app");
const filePicker = document.querySelector("#file-picker");

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

const uploadTargetLabels = {
	avatar: "头像素材",
	navbarLogo: "导航栏 Logo",
	desktopWallpaper: "桌面壁纸",
	mobileWallpaper: "手机壁纸",
	customImage: "通用图片",
	musicTrack: "音乐文件",
	musicCover: "音乐封面",
};

const state = {
	authenticated: false,
	loading: false,
	saving: false,
	publishing: false,
	state: {},
	footerHtml: "",
	info: null,
	statusTone: "",
	statusText: "后台准备中……",
	publishMessage: "chore: publish admin customizer update",
};

function cloneValue(value) {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function pathSegments(path) {
	return String(path)
		.replace(/\[(\d+)\]/g, ".$1")
		.split(".")
		.filter(Boolean)
		.map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function getValue(target, path, fallback = "") {
	let current = target;
	for (const segment of pathSegments(path)) {
		if (current == null) {
			return fallback;
		}
		current = current[segment];
	}
	return current ?? fallback;
}

function setValue(target, path, nextValue) {
	const segments = pathSegments(path);
	if (!segments.length) return;

	let current = target;
	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];
		const nextSegment = segments[index + 1];
		if (current[segment] == null) {
			current[segment] = typeof nextSegment === "number" ? [] : {};
		}
		current = current[segment];
	}

	current[segments[segments.length - 1]] = nextValue;
}

function deleteListItem(target, path, index) {
	const list = getValue(target, path, []);
	if (!Array.isArray(list)) return;
	list.splice(index, 1);
}

function pushListItem(target, path, value) {
	const list = getValue(target, path, []);
	if (!Array.isArray(list)) {
		setValue(target, path, [value]);
		return;
	}
	list.push(value);
}

function classifyAssetPath(value) {
	if (typeof value !== "string" || !value.trim()) return null;
	const lower = value.toLowerCase();
	const extension = lower.split("?")[0].slice(lower.lastIndexOf("."));

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

function buildPreviewUrl(assetPath) {
	if (/^https?:\/\//i.test(assetPath)) {
		return assetPath;
	}
	return `/api/asset?path=${encodeURIComponent(assetPath)}`;
}

function scanAssets(value, trace = "state", results = []) {
	if (typeof value === "string") {
		const assetType = classifyAssetPath(value);
		if (assetType) {
			results.push({
				trace,
				path: value,
				type: assetType,
				previewUrl: buildPreviewUrl(value),
			});
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

function collectAssetUsage() {
	const assetUsage = scanAssets({
		...state.state,
		footerHtml: state.footerHtml,
	});

	return assetUsage.filter(
		(item, index, list) =>
			list.findIndex(
				(candidate) =>
					candidate.trace === item.trace && candidate.path === item.path,
			) === index,
	);
}

function setStatus(text, tone = "") {
	state.statusText = text;
	state.statusTone = tone;
	renderStatusBox();
}

async function requestJson(url, options = {}) {
	const response = await fetch(url, {
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
		...options,
	});

	let payload = {};
	try {
		payload = await response.json();
	} catch (_error) {
		payload = {};
	}

	if (response.status === 401) {
		state.authenticated = false;
		renderApp();
		throw new Error(payload.error || "登录状态失效，请重新登录。");
	}

	if (!response.ok) {
		throw new Error(payload.error || "请求失败。");
	}

	return payload;
}

function readFileAsBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result || "");
			const commaIndex = result.indexOf(",");
			resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
		};
		reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
		reader.readAsDataURL(file);
	});
}

function pickFile(accept = "") {
	return new Promise((resolve) => {
		filePicker.value = "";
		filePicker.accept = accept;
		filePicker.onchange = () => resolve(filePicker.files?.[0] || null);
		filePicker.click();
	});
}

function isTruthy(value) {
	return Boolean(value);
}

function yesNoLabel(value) {
	return value ? "已开启" : "已关闭";
}

function formatJson(value) {
	return JSON.stringify(value, null, 2);
}

function renderAssetMedia(asset) {
	if (!asset?.path) {
		return `<div class="media"><span class="helper-line">当前没有素材</span></div>`;
	}

	if (asset.type === "image") {
		return `<div class="media"><img src="${escapeHtml(asset.previewUrl)}" alt="${escapeHtml(asset.trace || asset.path)}" /></div>`;
	}

	if (asset.type === "audio") {
		return `<div class="media"><audio controls preload="none" src="${escapeHtml(asset.previewUrl)}"></audio></div>`;
	}

	return `<div class="media"><span class="helper-line">当前路径</span></div>`;
}

function renderAssetCard(asset) {
	return `
		<div class="asset-card">
			${renderAssetMedia(asset)}
			<div class="asset-body">
				<div class="trace">${escapeHtml(asset.trace || "state")}</div>
				<div class="path">${escapeHtml(asset.path || "")}</div>
				<div class="chip">${escapeHtml(asset.type || "file")}</div>
			</div>
		</div>
	`;
}

function renderBoundAsset(path, label, uploadTarget) {
	const assetPath = getValue(state.state, path, "");
	const assetType = classifyAssetPath(assetPath) || "file";
	const asset = assetPath
		? {
				trace: path,
				path: assetPath,
				type: assetType,
				previewUrl: buildPreviewUrl(assetPath),
			}
		: null;

	return `
		<div class="list-row">
			<div class="thumb">
				${asset?.type === "image" ? `<img src="${escapeHtml(asset.previewUrl)}" alt="${escapeHtml(label)}" />` : `<div class="media"><span class="helper-line">暂无预览</span></div>`}
			</div>
			<div class="details-grid">
				<div class="field">
					<label>${escapeHtml(label)}</label>
					<input data-bind="${escapeHtml(path)}" value="${escapeHtml(assetPath)}" placeholder="填写图片路径或远程链接" />
				</div>
				<div class="inline-actions">
					<button class="button secondary" type="button" data-upload-set="${escapeHtml(path)}" data-upload-target="${escapeHtml(uploadTarget)}">上传并替换</button>
				</div>
				<div class="helper-line">这里会直接显示当前使用的素材，方便你知道现在替换的是哪一张。</div>
			</div>
		</div>
	`;
}

function renderListAssetEditor(path, label, uploadTarget) {
	const list = getValue(state.state, path, []);
	const items = Array.isArray(list) ? list : [];

	return `
		<div class="panel-lite-open">
			<h3>${escapeHtml(label)}</h3>
			<div class="list-box">
				${
					items.length
						? items
								.map((item, index) => {
									const assetType = classifyAssetPath(item) || "file";
									const previewUrl = buildPreviewUrl(item);
									return `
										<div class="list-row">
											<div class="thumb">
												${assetType === "image" ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(`${label}-${index + 1}`)}" />` : `<div class="media"><span class="helper-line">暂无预览</span></div>`}
											</div>
											<div class="details-grid">
												<div class="field">
													<label>${escapeHtml(`${label} ${index + 1}`)}</label>
													<input data-bind="${escapeHtml(`${path}[${index}]`)}" value="${escapeHtml(item)}" placeholder="填写素材路径或远程链接" />
												</div>
												<div class="trace">${escapeHtml(`${path}[${index}]`)}</div>
												<div class="inline-actions">
													<button class="button secondary" type="button" data-upload-set="${escapeHtml(`${path}[${index}]`)}" data-upload-target="${escapeHtml(uploadTarget)}">上传替换</button>
													<button class="button secondary" type="button" data-remove-item="${escapeHtml(path)}" data-remove-index="${index}">删除这一项</button>
												</div>
											</div>
										</div>
									`;
								})
								.join("")
						: `<div class="helper-line">当前列表还是空的，可以直接上传新增。</div>`
				}
				<div class="inline-actions">
					<button class="button secondary" type="button" data-add-item="${escapeHtml(path)}">新增空白项</button>
					<button class="button" type="button" data-upload-append="${escapeHtml(path)}" data-upload-target="${escapeHtml(uploadTarget)}">上传新增素材</button>
				</div>
			</div>
		</div>
	`;
}

function renderJsonField(label, path, value, rows = 10) {
	return `
		<div class="field">
			<label>${escapeHtml(label)}</label>
			<textarea data-json="${escapeHtml(path)}" rows="${rows}">${escapeHtml(formatJson(value))}</textarea>
			<div class="helper-line">这里填写 JSON，保存前会自动校验。</div>
		</div>
	`;
}

function renderLinesField(label, path, value, rows = 6) {
	const list = Array.isArray(value) ? value : [];
	return `
		<div class="field">
			<label>${escapeHtml(label)}</label>
			<textarea data-lines="${escapeHtml(path)}" rows="${rows}" placeholder="每行一项">${escapeHtml(list.join("\n"))}</textarea>
			<div class="helper-line">每一行都会作为一个单独条目保存。</div>
		</div>
	`;
}

function renderLogin() {
	app.innerHTML = `
		<div class="login-shell">
			<form class="login-card" id="login-form">
				<h1>Firefly 装饰后台</h1>
				<p class="subtle">登录后就可以直接看到博客当前正在使用的图片、音乐和装饰配置，并在这里替换、保存和发布。</p>
				<div class="grid" style="margin-top: 20px;">
					<div class="field">
						<label>后台账号</label>
						<input name="username" autocomplete="username" required />
					</div>
					<div class="field">
						<label>后台密码</label>
						<input name="password" type="password" autocomplete="current-password" required />
					</div>
				</div>
				<div class="inline-actions" style="margin-top: 18px;">
					<button class="button" type="submit">进入后台</button>
				</div>
				<div class="status-box" style="margin-top: 18px;">${escapeHtml(state.statusText)}</div>
			</form>
		</div>
	`;

	document.querySelector("#login-form")?.addEventListener("submit", handleLogin);
}

function renderDashboard() {
	const assetUsage = collectAssetUsage();
	const info = state.info || {};
	const repoRoot = info.repoRoot || "未知";
	const stateFile = info.stateFile || "未知";
	const footerHtmlFile = info.footerHtmlFile || "未知";
	const publishCommands = Array.isArray(info.publishCommands)
		? info.publishCommands.join(" / ")
		: "未提供";

	const siteConfig = getValue(state.state, "siteConfig", {});
	const profileConfig = getValue(state.state, "profileConfig", {});
	const backgroundWallpaper = getValue(state.state, "backgroundWallpaper", {});
	const musicPlayerConfig = getValue(state.state, "musicPlayerConfig", {});
	const announcementConfig = getValue(state.state, "announcementConfig", {});
	const footerConfig = getValue(state.state, "footerConfig", {});

	app.innerHTML = `
		<div class="shell">
			<div class="hero">
				<div class="hero-card">
					<h1>Firefly 可视化装饰后台</h1>
					<p>这里可以直接看到当前博客正在使用的素材和配置。你替换图片时，界面会把“现在用的是哪一张”和“它对应哪个配置字段”同时展示出来。</p>
				</div>
				<div class="actions">
					<button class="button secondary" type="button" id="reload-button">重新读取</button>
					<button class="button secondary" type="button" id="logout-button">退出登录</button>
				</div>
			</div>
			<div class="meta-strip">
				<div class="meta-item">
					<strong>仓库目录</strong>
					<span>${escapeHtml(repoRoot)}</span>
				</div>
				<div class="meta-item">
					<strong>状态文件</strong>
					<span>${escapeHtml(stateFile)}</span>
				</div>
				<div class="meta-item">
					<strong>页脚模板</strong>
					<span>${escapeHtml(footerHtmlFile)}</span>
				</div>
				<div class="meta-item">
					<strong>发布链路</strong>
					<span>${escapeHtml(publishCommands)}</span>
				</div>
			</div>
			<div class="layout">
				<div class="column" id="main-column"></div>
				<div class="column" id="side-column"></div>
			</div>
		</div>
	`;

	document.querySelector("#main-column").innerHTML = `
		${renderBasicPanel(siteConfig)}
		${renderProfilePanel(profileConfig)}
		${renderBackgroundPanel(backgroundWallpaper)}
		${renderMusicPanel(musicPlayerConfig)}
		${renderAnnouncementFooterPanel(announcementConfig, footerConfig)}
	`;

	document.querySelector("#side-column").innerHTML = `
		${renderAssetOverviewPanel(assetUsage)}
		${renderToolboxPanel()}
		${renderAdvancedPanel()}
		${renderPublishPanel()}
	`;

	bindDashboardEvents();
	renderStatusBox();
}

function renderApp() {
	if (!state.authenticated) {
		renderLogin();
		return;
	}
	renderDashboard();
}

function renderBasicPanel(siteConfig) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>基础外观</h2>
					<p class="subtle">站点标题、主题色和导航栏信息都在这里。Logo 会直接显示当前图，方便你知道替换的是哪一个。</p>
				</div>
				<div class="chip">${yesNoLabel(siteConfig?.themeColor?.fixed)}</div>
			</div>
			<div class="grid">
				<div class="field">
					<label>站点标题</label>
					<input data-bind="siteConfig.title" value="${escapeHtml(siteConfig?.title || "")}" />
				</div>
				<div class="field">
					<label>副标题</label>
					<input data-bind="siteConfig.subtitle" value="${escapeHtml(siteConfig?.subtitle || "")}" />
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label>站点描述</label>
					<textarea data-bind="siteConfig.description" rows="5">${escapeHtml(siteConfig?.description || "")}</textarea>
				</div>
				<div class="field">
					<label>主题色 Hue</label>
					<input data-bind="siteConfig.themeColor.hue" data-number="1" type="number" value="${escapeHtml(siteConfig?.themeColor?.hue ?? 165)}" />
				</div>
				<div class="field">
					<label>默认模式</label>
					<select data-bind="siteConfig.themeColor.defaultMode">
						${["system", "light", "dark"]
							.map(
								(item) =>
									`<option value="${item}" ${siteConfig?.themeColor?.defaultMode === item ? "selected" : ""}>${item}</option>`,
							)
							.join("")}
					</select>
				</div>
				<div class="field">
					<label>页面宽度</label>
					<input data-bind="siteConfig.pageWidth" data-number="1" type="number" value="${escapeHtml(siteConfig?.pageWidth ?? 100)}" />
				</div>
				<div class="field toggle">
					<input data-bind="siteConfig.themeColor.fixed" type="checkbox" ${isTruthy(siteConfig?.themeColor?.fixed) ? "checked" : ""} />
					<label>锁定主题色选择</label>
				</div>
				<div class="field">
					<label>导航栏标题</label>
					<input data-bind="siteConfig.navbar.title" value="${escapeHtml(siteConfig?.navbar?.title || "")}" />
				</div>
				<div class="field">
					<label>菜单对齐</label>
					<select data-bind="siteConfig.navbar.menuAlign">
						${["left", "center", "right"]
							.map(
								(item) =>
									`<option value="${item}" ${siteConfig?.navbar?.menuAlign === item ? "selected" : ""}>${item}</option>`,
							)
							.join("")}
					</select>
				</div>
				<div class="field toggle">
					<input data-bind="siteConfig.navbar.widthFull" type="checkbox" ${isTruthy(siteConfig?.navbar?.widthFull) ? "checked" : ""} />
					<label>导航栏铺满宽度</label>
				</div>
				<div class="field toggle">
					<input data-bind="siteConfig.navbar.followTheme" type="checkbox" ${isTruthy(siteConfig?.navbar?.followTheme) ? "checked" : ""} />
					<label>导航栏跟随主题色</label>
				</div>
			</div>
			${renderBoundAsset("siteConfig.navbar.logo.value", "当前导航栏 Logo", "navbarLogo")}
		</section>
	`;
}

function renderProfilePanel(profileConfig) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>个人卡片</h2>
					<p class="subtle">头像和简介是首页最显眼的地方，这里会明确显示当前头像预览以及它对应的字段。</p>
				</div>
			</div>
			${renderBoundAsset("profileConfig.avatar", "当前头像", "avatar")}
			<div class="grid" style="margin-top: 16px;">
				<div class="field">
					<label>显示名称</label>
					<input data-bind="profileConfig.name" value="${escapeHtml(profileConfig?.name || "")}" />
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label>个人简介</label>
					<textarea data-bind="profileConfig.bio" rows="4">${escapeHtml(profileConfig?.bio || "")}</textarea>
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label>社交链接配置</label>
					<textarea data-json="profileConfig.links" rows="12">${escapeHtml(formatJson(profileConfig?.links || []))}</textarea>
					<div class="helper-line">这里是链接列表 JSON，比如 QQ、GitHub、邮箱、RSS 等。</div>
				</div>
			</div>
		</section>
	`;
}

function renderBackgroundPanel(backgroundWallpaper) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>背景与横幅</h2>
					<p class="subtle">桌面端和手机端壁纸会逐张显示，你可以看到原图，再决定替换哪一张。</p>
				</div>
			</div>
			<div class="grid">
				<div class="field">
					<label>背景模式</label>
					<select data-bind="backgroundWallpaper.mode">
						${["banner", "image", "none"]
							.map(
								(item) =>
									`<option value="${item}" ${backgroundWallpaper?.mode === item ? "selected" : ""}>${item}</option>`,
							)
							.join("")}
					</select>
				</div>
				<div class="field toggle">
					<input data-bind="backgroundWallpaper.switchable" type="checkbox" ${isTruthy(backgroundWallpaper?.switchable) ? "checked" : ""} />
					<label>允许前台切换背景</label>
				</div>
				<div class="field">
					<label>横幅位置</label>
					<input data-bind="backgroundWallpaper.banner.position" value="${escapeHtml(backgroundWallpaper?.banner?.position || "")}" />
				</div>
				<div class="field">
					<label>横幅标题</label>
					<input data-bind="backgroundWallpaper.banner.homeText.title" value="${escapeHtml(backgroundWallpaper?.banner?.homeText?.title || "")}" />
				</div>
				<div class="field">
					<label>标题字号</label>
					<input data-bind="backgroundWallpaper.banner.homeText.titleSize" value="${escapeHtml(backgroundWallpaper?.banner?.homeText?.titleSize || "")}" />
				</div>
				<div class="field">
					<label>副标题字号</label>
					<input data-bind="backgroundWallpaper.banner.homeText.subtitleSize" value="${escapeHtml(backgroundWallpaper?.banner?.homeText?.subtitleSize || "")}" />
				</div>
				<div class="field">
					<label>桌面端版权文字</label>
					<input data-bind="backgroundWallpaper.banner.credit.text.desktop" value="${escapeHtml(backgroundWallpaper?.banner?.credit?.text?.desktop || "")}" />
				</div>
				<div class="field">
					<label>桌面端版权链接</label>
					<input data-bind="backgroundWallpaper.banner.credit.url.desktop" value="${escapeHtml(backgroundWallpaper?.banner?.credit?.url?.desktop || "")}" />
				</div>
				<div class="field">
					<label>手机端版权文字</label>
					<input data-bind="backgroundWallpaper.banner.credit.text.mobile" value="${escapeHtml(backgroundWallpaper?.banner?.credit?.text?.mobile || "")}" />
				</div>
				<div class="field">
					<label>手机端版权链接</label>
					<input data-bind="backgroundWallpaper.banner.credit.url.mobile" value="${escapeHtml(backgroundWallpaper?.banner?.credit?.url?.mobile || "")}" />
				</div>
			</div>
			${renderLinesField("横幅副标题列表", "backgroundWallpaper.banner.homeText.subtitle", backgroundWallpaper?.banner?.homeText?.subtitle || [], 7)}
			${renderListAssetEditor("backgroundWallpaper.src.desktop", "桌面壁纸", "desktopWallpaper")}
			${renderListAssetEditor("backgroundWallpaper.src.mobile", "手机壁纸", "mobileWallpaper")}
		</section>
	`;
}

function renderMusicPanel(musicPlayerConfig) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>音乐播放器</h2>
					<p class="subtle">播放器支持 Meting 和本地歌单两种方式，音频和封面也会出现在右侧素材总览里。</p>
				</div>
			</div>
			<div class="grid">
				<div class="field">
					<label>播放模式来源</label>
					<select data-bind="musicPlayerConfig.mode">
						${["meting", "local"]
							.map(
								(item) =>
									`<option value="${item}" ${musicPlayerConfig?.mode === item ? "selected" : ""}>${item}</option>`,
							)
							.join("")}
					</select>
				</div>
				<div class="field">
					<label>音量</label>
					<input data-bind="musicPlayerConfig.volume" data-number="1" type="number" step="0.1" min="0" max="1" value="${escapeHtml(musicPlayerConfig?.volume ?? 0.7)}" />
				</div>
				<div class="field">
					<label>播放顺序</label>
					<select data-bind="musicPlayerConfig.playMode">
						${["list", "one", "random"]
							.map(
								(item) =>
									`<option value="${item}" ${musicPlayerConfig?.playMode === item ? "selected" : ""}>${item}</option>`,
							)
							.join("")}
					</select>
				</div>
				<div class="field toggle">
					<input data-bind="musicPlayerConfig.showInNavbar" type="checkbox" ${isTruthy(musicPlayerConfig?.showInNavbar) ? "checked" : ""} />
					<label>导航栏显示播放器入口</label>
				</div>
				<div class="field toggle">
					<input data-bind="musicPlayerConfig.showLyrics" type="checkbox" ${isTruthy(musicPlayerConfig?.showLyrics) ? "checked" : ""} />
					<label>显示歌词</label>
				</div>
				<div class="field">
					<label>Meting API</label>
					<input data-bind="musicPlayerConfig.meting.api" value="${escapeHtml(musicPlayerConfig?.meting?.api || "")}" />
				</div>
				<div class="field">
					<label>Meting Server</label>
					<input data-bind="musicPlayerConfig.meting.server" value="${escapeHtml(musicPlayerConfig?.meting?.server || "")}" />
				</div>
				<div class="field">
					<label>Meting Type</label>
					<input data-bind="musicPlayerConfig.meting.type" value="${escapeHtml(musicPlayerConfig?.meting?.type || "")}" />
				</div>
				<div class="field">
					<label>Meting ID</label>
					<input data-bind="musicPlayerConfig.meting.id" value="${escapeHtml(musicPlayerConfig?.meting?.id || "")}" />
				</div>
				<div class="field">
					<label>Meting Auth</label>
					<input data-bind="musicPlayerConfig.meting.auth" value="${escapeHtml(musicPlayerConfig?.meting?.auth || "")}" />
				</div>
			</div>
			${renderLinesField("Meting 备用接口", "musicPlayerConfig.meting.fallbackApis", musicPlayerConfig?.meting?.fallbackApis || [], 5)}
			${renderJsonField("本地歌单配置", "musicPlayerConfig.local.playlist", musicPlayerConfig?.local?.playlist || [], 14)}
		</section>
	`;
}

function renderAnnouncementFooterPanel(announcementConfig, footerConfig) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>公告与页脚</h2>
					<p class="subtle">这里可以改首页公告和底部 HTML 注入。页脚 HTML 会实时保存到单独文件。</p>
				</div>
			</div>
			<div class="grid">
				<div class="field">
					<label>公告标题</label>
					<input data-bind="announcementConfig.title" value="${escapeHtml(announcementConfig?.title || "")}" />
				</div>
				<div class="field toggle">
					<input data-bind="announcementConfig.closable" type="checkbox" ${isTruthy(announcementConfig?.closable) ? "checked" : ""} />
					<label>公告允许关闭</label>
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label>公告内容</label>
					<textarea data-bind="announcementConfig.content" rows="5">${escapeHtml(announcementConfig?.content || "")}</textarea>
				</div>
				<div class="field toggle">
					<input data-bind="announcementConfig.link.enable" type="checkbox" ${isTruthy(announcementConfig?.link?.enable) ? "checked" : ""} />
					<label>启用公告链接</label>
				</div>
				<div class="field">
					<label>链接文案</label>
					<input data-bind="announcementConfig.link.text" value="${escapeHtml(announcementConfig?.link?.text || "")}" />
				</div>
				<div class="field">
					<label>链接地址</label>
					<input data-bind="announcementConfig.link.url" value="${escapeHtml(announcementConfig?.link?.url || "")}" />
				</div>
				<div class="field toggle">
					<input data-bind="announcementConfig.link.external" type="checkbox" ${isTruthy(announcementConfig?.link?.external) ? "checked" : ""} />
					<label>作为外链打开</label>
				</div>
				<div class="field toggle">
					<input data-bind="footerConfig.enable" type="checkbox" ${isTruthy(footerConfig?.enable) ? "checked" : ""} />
					<label>启用 Footer HTML 注入</label>
				</div>
				<div class="field" style="grid-column: 1 / -1;">
					<label>Footer HTML</label>
					<textarea data-footer="1" rows="10">${escapeHtml(state.footerHtml || "")}</textarea>
				</div>
			</div>
		</section>
	`;
}

function renderAssetOverviewPanel(assetUsage) {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>素材总览</h2>
					<p class="subtle">这里会扫描当前配置里用到的素材，并告诉你它来自哪个字段，比如 <code>backgroundWallpaper.src.desktop[0]</code>。</p>
				</div>
				<div class="chip">${assetUsage.length} 项</div>
			</div>
			<div class="preview-grid">
				${
					assetUsage.length
						? assetUsage.map(renderAssetCard).join("")
						: `<div class="helper-line">当前还没有扫描到素材。</div>`
				}
			</div>
		</section>
	`;
}

function renderToolboxPanel() {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>素材工具箱</h2>
					<p class="subtle">如果你只是想先上传素材拿路径，可以在这里直接传，路径会回显到状态框里。</p>
				</div>
			</div>
			<div class="asset-actions">
				${Object.entries(uploadTargetLabels)
					.map(
						([key, label]) =>
							`<button class="button secondary" type="button" data-tool-upload="${escapeHtml(key)}">${escapeHtml(label)}</button>`,
					)
					.join("")}
			</div>
		</section>
	`;
}

function renderAdvancedPanel() {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>高级装饰配置</h2>
					<p class="subtle">这里保留完整的 JSON 编辑能力，适合改樱花、Live2D、封面、字体、赞助、广告等更细的内容。</p>
				</div>
			</div>
			<div class="details-grid">
				<details class="panel-lite">
					<summary>导航栏扩展配置</summary>
					<div class="details-body">${renderJsonField("navBarConfig", "navBarConfig", getValue(state.state, "navBarConfig", {}), 14)}</div>
				</details>
				<details class="panel-lite">
					<summary>樱花粒子配置</summary>
					<div class="details-body">${renderJsonField("sakuraConfig", "sakuraConfig", getValue(state.state, "sakuraConfig", {}), 14)}</div>
				</details>
				<details class="panel-lite">
					<summary>Spine 看板娘配置</summary>
					<div class="details-body">${renderJsonField("spineModelConfig", "spineModelConfig", getValue(state.state, "spineModelConfig", {}), 16)}</div>
				</details>
				<details class="panel-lite">
					<summary>Live2D 看板娘配置</summary>
					<div class="details-body">${renderJsonField("live2dModelConfig", "live2dModelConfig", getValue(state.state, "live2dModelConfig", {}), 16)}</div>
				</details>
				<details class="panel-lite">
					<summary>封面图配置</summary>
					<div class="details-body">${renderJsonField("coverImageConfig", "coverImageConfig", getValue(state.state, "coverImageConfig", {}), 12)}</div>
				</details>
				<details class="panel-lite">
					<summary>字体配置</summary>
					<div class="details-body">${renderJsonField("fontConfig", "fontConfig", getValue(state.state, "fontConfig", {}), 12)}</div>
				</details>
				<details class="panel-lite">
					<summary>版权配置</summary>
					<div class="details-body">${renderJsonField("licenseConfig", "licenseConfig", getValue(state.state, "licenseConfig", {}), 10)}</div>
				</details>
				<details class="panel-lite">
					<summary>赞助配置</summary>
					<div class="details-body">${renderJsonField("sponsorConfig", "sponsorConfig", getValue(state.state, "sponsorConfig", {}), 16)}</div>
				</details>
				<details class="panel-lite">
					<summary>广告配置</summary>
					<div class="details-body">${renderJsonField("adConfig", "adConfig", getValue(state.state, "adConfig", {}), 16)}</div>
				</details>
			</div>
		</section>
	`;
}

function renderPublishPanel() {
	return `
		<section class="panel">
			<div class="panel-header">
				<div>
					<h2>保存与发布</h2>
					<p class="subtle">保存只会写入仓库工作区，发布会执行检查、构建和推送，适合确认无误后再点。</p>
				</div>
			</div>
			<div class="field">
				<label>发布提交信息</label>
				<input id="publish-message" value="${escapeHtml(state.publishMessage)}" />
			</div>
			<div class="inline-actions" style="margin-top: 16px;">
				<button class="button secondary" type="button" id="save-button">${state.saving ? "保存中…" : "保存配置"}</button>
				<button class="button warn" type="button" id="publish-button">${state.publishing ? "发布中…" : "保存并发布"}</button>
			</div>
			<div class="status-box ${escapeHtml(state.statusTone)}" id="status-box" style="margin-top: 16px;">${escapeHtml(state.statusText)}</div>
		</section>
	`;
}

function bindDashboardEvents() {
	document.querySelector("#reload-button")?.addEventListener("click", loadState);
	document.querySelector("#logout-button")?.addEventListener("click", handleLogout);
	document.querySelector("#save-button")?.addEventListener("click", () => {
		void saveState();
	});
	document.querySelector("#publish-button")?.addEventListener("click", () => {
		void publishState();
	});
	document.querySelector("#publish-message")?.addEventListener("change", (event) => {
		state.publishMessage = event.target.value;
	});

	document.querySelectorAll("[data-bind]").forEach((element) => {
		const eventName =
			element instanceof HTMLSelectElement || element.type === "checkbox"
				? "change"
				: "change";

		element.addEventListener(eventName, (event) => {
			const input = event.target;
			const path = input.dataset.bind;
			let value = input.value;

			if (input.type === "checkbox") {
				value = input.checked;
			} else if (input.dataset.number) {
				value = input.value === "" ? 0 : Number(input.value);
			}

			setValue(state.state, path, value);
			if (
				path === "profileConfig.avatar" ||
				path === "siteConfig.navbar.logo.value" ||
				path.startsWith("backgroundWallpaper.src.")
			) {
				renderDashboard();
			}
		});
	});

	document.querySelectorAll("[data-lines]").forEach((element) => {
		element.addEventListener("change", (event) => {
			const input = event.target;
			const path = input.dataset.lines;
			const value = input.value
				.split(/\r?\n/)
				.map((item) => item.trim())
				.filter(Boolean);
			setValue(state.state, path, value);
			renderDashboard();
		});
	});

	document.querySelectorAll("[data-json]").forEach((element) => {
		element.addEventListener("change", (event) => {
			const input = event.target;
			const path = input.dataset.json;
			try {
				const parsed = JSON.parse(input.value || "null");
				setValue(state.state, path, parsed);
				setStatus(`已更新 ${path} 的 JSON 配置。`, "ok");
				renderDashboard();
			} catch (error) {
				setStatus(
					`${path} 的 JSON 解析失败：${error instanceof Error ? error.message : "格式错误"}`,
					"warn-text",
				);
			}
		});
	});

	document.querySelector("[data-footer]")?.addEventListener("change", (event) => {
		state.footerHtml = event.target.value;
	});

	document.querySelectorAll("[data-upload-set]").forEach((button) => {
		button.addEventListener("click", () => {
			void uploadAndSet(button.dataset.uploadSet, button.dataset.uploadTarget);
		});
	});

	document.querySelectorAll("[data-upload-append]").forEach((button) => {
		button.addEventListener("click", () => {
			void uploadAndAppend(
				button.dataset.uploadAppend,
				button.dataset.uploadTarget,
			);
		});
	});

	document.querySelectorAll("[data-remove-item]").forEach((button) => {
		button.addEventListener("click", () => {
			deleteListItem(
				state.state,
				button.dataset.removeItem,
				Number(button.dataset.removeIndex),
			);
			renderDashboard();
		});
	});

	document.querySelectorAll("[data-add-item]").forEach((button) => {
		button.addEventListener("click", () => {
			pushListItem(state.state, button.dataset.addItem, "");
			renderDashboard();
		});
	});

	document.querySelectorAll("[data-tool-upload]").forEach((button) => {
		button.addEventListener("click", () => {
			void uploadLooseAsset(button.dataset.toolUpload);
		});
	});
}

function renderStatusBox() {
	const box = document.querySelector("#status-box");
	if (box) {
		box.className = `status-box ${state.statusTone || ""}`.trim();
		box.textContent = state.statusText;
	}
}

async function uploadFile(target) {
	const accept =
		target === "musicTrack"
			? ".mp3,.wav,.ogg,.flac,.m4a,.aac"
			: ".png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.ico";
	const file = await pickFile(accept);
	if (!file) {
		return null;
	}

	setStatus(`正在上传 ${file.name} ……`);
	const payload = {
		target,
		filename: file.name,
		contentBase64: await readFileAsBase64(file),
	};

	const result = await requestJson("/api/upload", {
		method: "POST",
		body: JSON.stringify(payload),
	});

	setStatus(`上传完成：${result.path}`, "ok");
	return result;
}

async function uploadAndSet(path, target) {
	if (!path || !target) return;
	try {
		const result = await uploadFile(target);
		if (!result) return;
		setValue(state.state, path, result.path);
		renderDashboard();
	} catch (error) {
		setStatus(error instanceof Error ? error.message : "上传失败。", "warn-text");
	}
}

async function uploadAndAppend(path, target) {
	if (!path || !target) return;
	try {
		const result = await uploadFile(target);
		if (!result) return;
		pushListItem(state.state, path, result.path);
		renderDashboard();
	} catch (error) {
		setStatus(error instanceof Error ? error.message : "上传失败。", "warn-text");
	}
}

async function uploadLooseAsset(target) {
	if (!target) return;
	try {
		const result = await uploadFile(target);
		if (!result) return;
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(result.path);
			setStatus(`上传完成，路径已复制到剪贴板：${result.path}`, "ok");
			return;
		}
		setStatus(`上传完成：${result.path}`, "ok");
	} catch (error) {
		setStatus(error instanceof Error ? error.message : "上传失败。", "warn-text");
	}
}

async function handleLogin(event) {
	event.preventDefault();
	const form = event.currentTarget;
	const formData = new FormData(form);
	const username = String(formData.get("username") || "");
	const password = String(formData.get("password") || "");

	try {
		setStatus("正在登录后台……");
		await requestJson("/api/login", {
			method: "POST",
			body: JSON.stringify({ username, password }),
		});
		state.authenticated = true;
		await loadState();
	} catch (error) {
		setStatus(error instanceof Error ? error.message : "登录失败。", "warn-text");
		renderLogin();
	}
}

async function handleLogout() {
	try {
		await requestJson("/api/logout", {
			method: "POST",
			body: "{}",
		});
	} catch (_error) {
		// ignore logout failure and reset locally
	}
	state.authenticated = false;
	state.state = {};
	state.footerHtml = "";
	state.info = null;
	state.statusText = "已退出登录。";
	state.statusTone = "";
	renderApp();
}

async function loadState() {
	try {
		state.loading = true;
		setStatus("正在读取当前博客配置……");
		const payload = await requestJson("/api/state", { method: "GET" });
		state.authenticated = true;
		state.state = cloneValue(payload.state || {});
		state.footerHtml = payload.footerHtml || "";
		state.info = payload.info || null;
		state.loading = false;
		setStatus("已读取当前配置。现在你可以直接看到目前正在用的素材和字段。", "ok");
		renderApp();
	} catch (error) {
		state.loading = false;
		setStatus(error instanceof Error ? error.message : "读取状态失败。", "warn-text");
		renderApp();
	}
}

function assertJsonEditorsValid() {
	const invalid = [];
	document.querySelectorAll("[data-json]").forEach((element) => {
		try {
			JSON.parse(element.value || "null");
		} catch (_error) {
			invalid.push(element.dataset.json);
		}
	});

	if (invalid.length) {
		throw new Error(`这些 JSON 配置还没有写对：${invalid.join("、")}`);
	}
}

async function saveState() {
	try {
		state.saving = true;
		renderStatusBox();
		assertJsonEditorsValid();
		setStatus("正在保存配置到仓库工作区……");
		const payload = await requestJson("/api/save", {
			method: "POST",
			body: JSON.stringify({
				state: state.state,
				footerHtml: state.footerHtml,
			}),
		});
		state.state = cloneValue(payload.state || state.state);
		state.footerHtml = payload.footerHtml || state.footerHtml;
		state.info = payload.info || state.info;
		state.saving = false;
		setStatus(payload.message || "保存成功。", "ok");
		renderApp();
		return payload;
	} catch (error) {
		state.saving = false;
		setStatus(error instanceof Error ? error.message : "保存失败。", "warn-text");
		renderStatusBox();
		throw error;
	}
}

function formatPublishLogs(logs) {
	return (logs || [])
		.map((item) => {
			const stdout = item.stdout?.trim() ? `\n[stdout]\n${item.stdout.trim()}` : "";
			const stderr = item.stderr?.trim() ? `\n[stderr]\n${item.stderr.trim()}` : "";
			return `# ${item.label} (exit ${item.code})${stdout}${stderr}`;
		})
		.join("\n\n");
}

async function publishState() {
	try {
		state.publishing = true;
		await saveState();
		setStatus("正在执行 firefly-check / firefly-build / firefly-publish ……");
		const payload = await requestJson("/api/publish", {
			method: "POST",
			body: JSON.stringify({
				message: state.publishMessage,
			}),
		});
		state.state = cloneValue(payload.state || state.state);
		state.footerHtml = payload.footerHtml || state.footerHtml;
		state.info = payload.info || state.info;
		state.publishing = false;
		const logsText = formatPublishLogs(payload.logs);
		setStatus(
			`${payload.message || "发布完成。"}${logsText ? `\n\n${logsText}` : ""}`,
			"ok",
		);
		renderApp();
	} catch (error) {
		state.publishing = false;
		setStatus(error instanceof Error ? error.message : "发布失败。", "warn-text");
		renderStatusBox();
	}
}

async function bootstrap() {
	try {
		const payload = await requestJson("/api/state", { method: "GET" });
		state.authenticated = true;
		state.state = cloneValue(payload.state || {});
		state.footerHtml = payload.footerHtml || "";
		state.info = payload.info || null;
		state.statusText = "已自动恢复登录状态。";
		state.statusTone = "ok";
		renderApp();
	} catch (_error) {
		state.authenticated = false;
		state.statusText = "请输入后台账号和密码。";
		state.statusTone = "";
		renderApp();
	}
}

bootstrap();
