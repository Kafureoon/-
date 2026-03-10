# Firefly 装饰后台

这是给 Firefly 博客用的独立后台。它不会把博客改造成传统 CMS，而是直接编辑仓库里的：

- `data/admin/customizer.state.json`
- `src/config/FooterConfig.html`

然后再调用现成的：

- `firefly-check`
- `firefly-build`
- `firefly-publish`

这样做的好处是稳定、可追踪、和现在的 GitHub Pages 工作流兼容。

## 这个后台能做什么

- 读取博客当前正在使用的装饰配置
- 自动扫描当前素材，并显示：
  - 预览图或音频控件
  - 素材路径
  - 它来自哪个配置字段
- 直接上传头像、Logo、壁纸、音乐、封面等素材
- 直接替换当前字段对应的资源
- 修改站点标题、简介、公告、页脚 HTML
- 编辑高级装饰 JSON，比如：
  - 导航栏扩展
  - 樱花粒子
  - Spine / Live2D
  - 封面图
  - 字体
  - 赞助
  - 广告
- 保存到工作区
- 一键检查、构建、发布

## 你最关心的那部分

后台右侧有一个“素材总览”面板。

它会扫描整个配置状态，把所有当前用到的素材列出来，并明确显示：

- 现在正在用的是什么
- 这张图或这个文件的路径是什么
- 它对应哪个配置字段

比如会看到：

- `profileConfig.avatar`
- `siteConfig.navbar.logo.value`
- `backgroundWallpaper.src.desktop[0]`

这样替换图片时就不会再靠猜。

## 运行方式

先进入仓库根目录，然后启动：

```bash
node tools/firefly-customizer/server.mjs
```

默认监听：

- `0.0.0.0:3218`

## 环境变量

- `FIREFLY_CUSTOMIZER_HOST`
  - 后台监听地址
- `FIREFLY_CUSTOMIZER_PORT`
  - 后台端口
- `FIREFLY_CUSTOMIZER_USERNAME`
  - 登录账号
- `FIREFLY_CUSTOMIZER_PASSWORD`
  - 登录密码

示例：

```bash
export FIREFLY_CUSTOMIZER_HOST=0.0.0.0
export FIREFLY_CUSTOMIZER_PORT=3218
export FIREFLY_CUSTOMIZER_USERNAME=admin
export FIREFLY_CUSTOMIZER_PASSWORD='your-strong-password'
node tools/firefly-customizer/server.mjs
```

## 路由

- `GET /health`
  - 健康检查
- `POST /api/login`
  - 登录
- `POST /api/logout`
  - 登出
- `GET /api/state`
  - 获取当前状态、页脚 HTML、素材扫描结果
- `POST /api/save`
  - 保存状态到仓库工作区
- `POST /api/upload`
  - 上传素材并返回可写入配置的路径
- `GET /api/asset?path=...`
  - 读取本地素材用于后台预览
- `POST /api/publish`
  - 调用检查、构建、发布命令

## 上传目标

`/api/upload` 目前支持这些目标：

- `avatar`
- `navbarLogo`
- `desktopWallpaper`
- `mobileWallpaper`
- `customImage`
- `musicTrack`
- `musicCover`

## 部署建议

最稳妥的方式是把这个后台单独跑在服务器上，然后反向代理到一个只给自己用的地址，比如：

- `https://admin.your-domain.com/firefly/`

如果要长期在线，建议再配一个 systemd service。

## 注意

- “保存配置”不会自动发布线上站点
- “保存并发布”才会真正执行检查、构建、推送
- 高级 JSON 面板更自由，但也更容易写错，保存前后台会做基础校验
