import {
	LinkPreset,
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/config";
import { loadCustomizerSection } from "./customizerState";
import { siteConfig } from "./siteConfig";

const getDynamicNavBarConfig = (): NavBarConfig => {
	const links: (NavBarLink | LinkPreset)[] = [
		LinkPreset.Home,
		LinkPreset.Archive,
	];

	links.push(LinkPreset.Friends);

	if (siteConfig.pages.guestbook) {
		links.push({
			name: "悄悄话",
			url: "/guestbook/",
			icon: "material-symbols:chat-bubble-outline",
		});
	}

	links.push({
		name: "铃音的口袋",
		url: "/my/",
		icon: "material-symbols:smart-toy-outline",
		children: [
			...(siteConfig.pages.gallery ? [LinkPreset.Gallery] : []),
			...(siteConfig.pages.bangumi ? [LinkPreset.Bangumi] : []),
		],
	});

	links.push({
		name: "关于咱们",
		url: "/content/",
		icon: "material-symbols:favorite-outline",
		children: [
			...(siteConfig.pages.sponsor ? [LinkPreset.Sponsor] : []),
			LinkPreset.About,
		],
	});

	links.push({
		name: "连接异世界",
		url: "/links/",
		icon: "material-symbols:door-open-outline",
		children: [
			{
				name: "GitHub 基地",
				url: "https://github.com/Kafureoon/-",
				external: true,
				icon: "fa7-brands:github",
			},
			{
				name: "找 Oaa 玩",
				url: "https://qm.qq.com/q/ZGsFa8qX2G",
				external: true,
				icon: "fa7-brands:qq",
			},
		],
	});

	return { links } as NavBarConfig;
};

export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

export const navBarConfig: NavBarConfig = loadCustomizerSection(
	"navBarConfig",
	getDynamicNavBarConfig(),
);
