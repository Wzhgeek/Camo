# Camo 工作方法

## 版本升级与构建

### 版本号同步

3 处版本号需保持一致，使用 `scripts/bump-version.sh` 自动同步：

```bash
bash scripts/bump-version.sh 0.2.10
```

脚本会自动更新：
- `package.json` — `version`
- `src-tauri/Cargo.toml` — `version`
- `src-tauri/tauri.conf.json` — `version`

关于页面（SettingsPanel → 关于）从 `package.json` 动态读取，无需手动更新。

### Git 提交与发布

```bash
# 1. 提交代码
git add -A
git commit -m "feat: xxx"

# 2. 推送（由用户决定）
git push

# 3. 打标签构建（由用户决定）
git tag v0.2.10
git push origin v0.2.10
```

### 构建签名

构建需要使用签名私钥：

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/camo.key npx tauri build
```

如果设置了密码保护，需要额外传入：
```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/camo.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD=密码 npx tauri build
```

构建产物在 `src-tauri/target/release/bundle/` 目录。

### 更新器

- 应用内更新使用 `@tauri-apps/plugin-updater`
- 更新端点：`https://github.com/Wzhgeek/Camo/releases/latest/download/updater.json`
- 右键菜单 → 检查更新，或启动时自动检查

## 项目结构

```
src/
├── App.vue                    # 主入口，窗口路由、状态管理
├── components/
│   ├── CamoPet.vue            # 桌宠渲染、拖拽、单击/双击
│   ├── ChatPanel.vue          # LLM 对话面板
│   ├── SettingsPanel.vue      # 设置面板（多 tab）
│   ├── ReminderPanel.vue      # 提醒管理面板
│   ├── ReminderBubble.vue     # 提醒气泡
│   ├── NotesPanel.vue         # 便签管理面板
│   └── StickyNoteWindow.vue   # 独立便签窗口
├── core/
│   ├── affection/service.ts   # 好感度服务（CRUD、日上限）
│   ├── audio.ts               # 音效播放（Web Audio API + 自定义 mp3）
│   ├── appearance.ts          # 外观管理（主题、字体、颜色）
│   ├── autostart.ts           # 开机自启动
│   ├── camo/
│   │   ├── state.ts           # 状态机（CamoState、CamoEvent）
│   │   └── assets.ts          # 素材映射
│   ├── llm/                   # LLM 提供商（OpenAI 兼容 + Ollama）
│   ├── platform.ts            # isTauri 判断
│   ├── reminder/              # 提醒系统（调度器、解析器、服务）
│   ├── stats/service.ts       # 统计查询服务
│   └── storage/
│       ├── database.ts        # sql.js 数据库封装
│       └── migrations.ts      # 表结构迁移
├── stores/                    # Pinia stores
│   ├── affectionStore.ts      # 好感度状态
│   ├── camoStore.ts           # 宠物状态（idle 循环）
│   ├── chatStore.ts           # 对话历史
│   ├── reminderStore.ts       # 提醒状态
│   ├── settingsStore.ts       # 全局设置
│   └── statsStore.ts          # 统计数据
└── styles/theme.css           # CSS 变量主题系统

src-tauri/
├── tauri.conf.json            # Tauri 配置
├── Cargo.toml                 # Rust 依赖
├── src/lib.rs                 # Rust 入口（插件注册、托盘）
└── capabilities/default.json  # 权限声明
```

## 关键约定

1. 推送和构建必须等用户明确指示
2. 代码提交前需通过 `npx tsc --noEmit`
3. 所有新功能先在 plan 模式讨论方案再实现
4. 使用中文回复用户
