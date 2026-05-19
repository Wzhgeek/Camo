# Camo

Camo 是一个基于 Tauri 2、Vue 3 和 TypeScript 的轻量桌面桌宠个人助手原型。当前版本优先完成可运行 MVP：桌面透明悬浮 Camo、点击打开聊天面板、状态图片切换，以及 mock 聊天回复闭环。

## 技术栈

- Desktop: Tauri 2
- Frontend: Vue 3 + Vite + TypeScript
- State: Pinia
- Style: CSS
- Package Manager: npm 或 pnpm

## 目录结构

```text
Camo/
├─ Camo_asset/              # 原始 Camo 图片素材
├─ public/camo/             # 前端运行时访问的素材
├─ src/
│  ├─ components/           # CamoPet 和 ChatPanel
│  ├─ core/camo/            # 状态模型和素材 manifest
│  ├─ stores/               # Pinia 状态
│  ├─ styles/               # 全局样式
│  ├─ App.vue
│  └─ main.ts
├─ src-tauri/               # Tauri 桌面端配置和 Rust 入口
└─ README.md
```

## 如何运行

推荐直接使用 npm：

```bash
npm install
npm start
```

如果从 GitHub 作为 npm 命令安装：

```bash
npm install -g github:Wzhgeek/Camo
camo
```

这会从源码启动桌面应用。使用者需要本机已安装 Node.js、Rust 工具链，以及对应系统的 Tauri 开发依赖。

也可以使用 pnpm：

```bash
pnpm install
pnpm start
```

只预览前端页面：

```bash
npm run dev
```

注意：普通浏览器会把透明页面合成到白色背景上，真正的透明桌面窗需要通过 `npm start` / Tauri 启动。

构建：

```bash
npm run package
```

## 如何配置 LLM

当前 MVP 还没有接入真实 LLM，聊天面板会返回 mock 回复。后续 Task 5 会增加 OpenAI-compatible API 和 Ollama 配置。

## 如何放置 Camo 素材

真实素材放在：

```text
Camo_asset/
```

当前需要这些文件：

```text
camo_idle.png
camo_happy.png
camo_thinking.png
camo_answering.png
camo_reminder.png
camo_water.png
camo_exercise.png
camo_sleepy.png
camo_done.png
camo_icon.png
```

运行时素材位于 `public/camo/`，组件统一通过 `src/core/camo/assets.ts` 读取路径。桌宠要真正贴在透明窗口上，素材本身也必须是带 alpha 通道的透明 PNG；如果图片里自带棋盘格或白底，应用无法自动把它变透明。

## 如何创建提醒

当前 MVP 还没有实现提醒解析、存储和触发。后续 Task 6-9 会支持自然语言提醒、喝水提醒和健康训练提醒。

## 当前已完成功能

- [x] Task 1：创建 Tauri + Vue + TypeScript 项目。
- [x] Task 2：导入 Camo 素材，创建素材 manifest 和状态模型。
- [x] Task 3：实现透明无边框桌宠悬浮窗、Camo 展示、轻微浮动动画和点击反馈。
- [x] Task 4：实现聊天面板、消息列表、输入框、发送消息和 mock 回复。

## 待开发功能

- [ ] Task 5：接入 OpenAI-compatible API 和 Ollama。
- [ ] Task 6：实现提醒解析和创建。
- [ ] Task 7：实现提醒触发和提醒气泡。
- [ ] Task 8：实现喝水提醒。
- [ ] Task 9：实现健康训练提醒。
- [ ] Task 10：迁移到 SQLite 持久化。

## 兼容说明

窗口已配置为透明、无边框、置顶和不可缩放。macOS 透明窗口需要 Tauri 的 `macOSPrivateApi` / `macos-private-api` 配置，当前 MVP 已启用；这适合本地桌面原型，但不适合作为 Mac App Store 分发配置。不同平台对透明窗口和阴影的支持可能有差异。
