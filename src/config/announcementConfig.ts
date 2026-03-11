import type { AnnouncementConfig } from "../types/config";
import { loadCustomizerSection } from "./customizerState";

const defaultAnnouncementConfig: AnnouncementConfig = {
	enable: true,
	content: "嗨呀！这里是铃音接管后的 Firefly！✨ 所有的逻辑漏洞都已经被我清理干净啦，Oaa 快进来随便坐坐～🍭✨",
};

export const announcementConfig: AnnouncementConfig = loadCustomizerSection(
	"announcementConfig",
	defaultAnnouncementConfig,
);
