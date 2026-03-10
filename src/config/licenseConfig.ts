import type { LicenseConfig } from "../types/config";
import { loadCustomizerSection } from "./customizerState";

const defaultLicenseConfig: LicenseConfig = {
	// 是否启用文章顶部许可证信息显示
	enable: true,

	// 许可证名称及链接
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const licenseConfig: LicenseConfig = loadCustomizerSection(
	"licenseConfig",
	defaultLicenseConfig,
);
