# Camo

Camo 是一个基于 Tauri 2、Vue 3 和 TypeScript 的轻量桌面桌宠个人助手。支持 LLM 问答、自然语言提醒、喝水提醒、会话管理，以及 SQLite 持久化存储。

## 技术栈

- Desktop: Tauri 2
- Frontend: Vue 3 + Vite + TypeScript
- State: Pinia
- Storage: sql.js (WASM SQLite) + IndexedDB
- Icons: Lucide Vue Next
- Style: CSS
- Package Manager: npm

## 功能

- **LLM 问答** — 支持 OpenAI-compatible API 和 Ollama，流式输出 + 思考过程渲染
- **自然语言提醒** — 聊天中输入"明天九点开会"自动创建提醒，支持中文数字解析
- **喝水提醒** — 可配置间隔和活跃时段，实时倒计时显示
- **提醒管理面板** — 手动创建/删除/启停提醒，支持一次性/每天/循环间隔
- **会话管理** — 多会话创建/切换/删除/清除，自动标题
- **SQLite 持久化** — 聊天记录、提醒、设置跨刷新保留
- **桌宠状态切换** — 根据 LLM 对话阶段和提醒类型切换状态图片
- **CLI 配置** — `camo config` 命令行配置 LLM 参数

## 目录结构

```text
Camo/
├─ public/camo/             # 桌宠素材 (透明 PNG)
├─ scripts/camo.js          # CLI 入口 (camo / camo config)
├─ src/
│  ├─ components/           # Vue 组件
│  │  ├─ CamoPet.vue       # 桌宠展示和拖拽
│  │  ├─ ChatPanel.vue     # 聊天面板 + 会话管理
│  │  ├─ ReminderBubble.vue # 提醒触发气泡
│  │  ├─ ReminderPanel.vue # 提醒管理面板
│  │  └─ SettingsPanel.vue # 设置面板 (LLM/提示词)
│  ├─ core/
│  │  ├─ agent/intent.ts   # 意图识别
│  │  ├─ camo/             # 状态机和素材映射
│  │  ├─ llm/              # LLM providers (OpenAI/Ollama)
│  │  ├─ reminder/         # 提醒系统 (解析/服务/调度)
│  │  └─ storage/          # SQLite 数据库和迁移
│  ├─ stores/              # Pinia stores
│  ├─ styles/              # 全局样式
│  ├─ App.vue
│  └─ main.ts
├─ src-tauri/              # Tauri 桌面端配置
└─ README.md
```

## 如何运行

```bash
npm install
npm run dev        # 浏览器预览 (localhost:1420)
npm start          # Tauri 桌面应用
```

CLI 配置 LLM：

```bash
camo config --provider ollama --base-url http://localhost:11434 --model qwen3.5:2b
```

构建：

```bash
npm run package
```

## 如何配置 LLM

右键桌宠 → 设置 → LLM tab，支持：
- **Provider**: OpenAI-compatible / Ollama
- **Base URL**: API 地址
- **API Key**: 密钥（OpenAI 模式）
- **Model**: 模型名称

也可通过 `camo config` 命令行配置，写入 `~/.camo/config.json`。

## 如何创建提醒

1. **聊天创建** — 输入自然语言如"明天九点开会"、"每隔30分钟喝水"
2. **手动创建** — 右键桌宠 → 提醒 → 新建，设置标题/类型/周期/时间

支持的时间格式：
- 中文数字："九点半"、"下午三点"
- 阿拉伯数字："9:30"、"15:00"
- 相对时间："30分钟后"、"2小时后"
- 日期："明天"、"后天"（凌晨5点前"明天"指当天白天）

## 素材

桌宠素材位于 `public/camo/`，需要透明 PNG：

```text
camo_idle.png / camo_happy.png / camo_thinking.png / camo_answering.png
camo_reminder.png / camo_water.png / camo_exercise.png
camo_sleepy.png / camo_done.png / camo_icon.png
```

## 兼容说明

窗口配置为透明、无边框、置顶。macOS 需要 Tauri 的 `macos-private-api` 配置（已启用）。浏览器预览模式下透明背景会合成到渐变背景上。
