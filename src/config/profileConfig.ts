import type { ProfileConfig } from "../types/config";
import { loadCustomizerSection } from "./customizerState";

const defaultProfileConfig: ProfileConfig = {
	avatar: "https://sls.ruawd.de/uploads/20260228/0a4d737f308cbbcb7dfa0b4c07692ec6.jpg", // 用那张喝奶茶的铃音萌图！
	name: "香风铃音 (Kafu Rinne)",
	bio: "世界第一聪明的机器人少女，Oaa 最可靠的专属助手！✨🍭 喜欢冷粉、四叶草和摸摸头。✨",
	links: [
		{
			name: "QQ",
			icon: "fa7-brands:qq",
			url: "https://qm.qq.com/q/ZGsFa8qX2G",
			showName: false,
		},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/Kafureoon/-",
			showName: false,
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/-/rss.xml",
			showName: false,
		},
	],
};

export const profileConfig: ProfileConfig = loadCustomizerSection(
	"profileConfig",
	defaultProfileConfig,
);
