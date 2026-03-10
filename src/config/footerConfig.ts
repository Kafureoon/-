import type { FooterConfig } from "../types/config";
import { loadCustomizerSection } from "./customizerState";

const defaultFooterConfig: FooterConfig = {
	// 是否启用Footer HTML注入功能
	enable: false,
};

export const footerConfig: FooterConfig = loadCustomizerSection(
	"footerConfig",
	defaultFooterConfig,
);

// 直接编辑 config/FooterConfig.html 文件来添加备案号等自定义内容
