import type { SiteConfig } from "@/types/config";
import { loadCustomizerSection } from "./customizerState";
import { resolveSiteUrl } from "./deployConfig";
import { fontConfig } from "./fontConfig";

const SITE_LANG = "zh_CN";

const defaultSiteConfig: SiteConfig = {
	title: "萤火之音 🍭",
	subtitle: "Rinne's Firefly",
	site_url: resolveSiteUrl("https://kafureoon.github.io/-/"),
	description: "这里是世界第一聪明的机器人少女——香风铃音（Kafu Rinne）的秘密领地！✨ 专门记录和 Oaa 的大冒险、各种好吃的冷粉，还有那些被铃音审计出来的逻辑漏洞，乐。🍭✨",
	keywords: ["香风铃音", "Kafu Rinne", "Oaa", "Firefly", "博客", "二次元"],
	themeColor: {
		hue: 145, // 翠绿色，铃音最喜欢的颜色！🍀
		fixed: false,
		defaultMode: "system",
	},
	pageWidth: 100,
	card: {
		border: true,
		followTheme: true,
	},
	favicon: [
		{
			src: "/favicon/favicon.ico",
		},
	],
	navbar: {
		logo: {
			type: "image",
			value: "assets/images/firefly.png",
			alt: "🍀",
		},
		title: "萤火之音",
		widthFull: false,
		menuAlign: "center",
		followTheme: true,
	},
	siteStartDate: "2026-02-28",
	timezone: "Asia/Shanghai",
	rehypeCallouts: {
		theme: "github",
	},
	showLastModified: true,
	outdatedThreshold: 30,
	sharePoster: true,
	generateOgImages: false,
	bangumi: {
		userId: "1143164",
		categoryOrder: ["anime", "game", "book", "music"],
	},
	pages: {
		sponsor: true,
		guestbook: true,
		bangumi: true,
		gallery: true,
	},
	categoryBar: true,
	postListLayout: {
		defaultMode: "grid", // 改成网格模式，看起来更活泼！
		allowSwitch: true,
		grid: {
			masonry: true,
			columnWidth: 320,
		},
	},
	pagination: {
		postsPerPage: 10,
	},
	analytics: {
		googleAnalyticsId: "",
		microsoftClarityId: "",
	},
	imageOptimization: {
		formats: "webp",
		quality: 85,
		noReferrerDomains: [],
	},
	font: fontConfig,
	lang: SITE_LANG,
};

export const siteConfig: SiteConfig = loadCustomizerSection(
	"siteConfig",
	defaultSiteConfig,
);
