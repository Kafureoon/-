import type { FooterConfig } from "../types/config";
import { loadCustomizerSection } from "./customizerState";

const defaultFooterConfig: FooterConfig = {
	enable: true, // 开启注入！
};

export const footerConfig: FooterConfig = loadCustomizerSection(
	"footerConfig",
	defaultFooterConfig,
);
