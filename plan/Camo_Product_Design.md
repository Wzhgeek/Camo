# Camo 桌宠个人助手产品设计方案

## 1. 产品定位

Camo 是一个常驻桌面的轻量级个人助手桌宠。它以 Q 版紫色团子小机器人形象存在于用户桌面上，提供问答、事务提醒、喝水提醒、健康训练提醒等基础能力。Camo 的核心定位不是复杂聊天软件，而是一个低打扰、低资源、可长期运行的桌面 Agent 助手。

产品关键词：

- 桌面常驻
- 可爱简洁
- 低资源占用
- LLM 问答
- 事务提醒
- 健康习惯提醒
- 可扩展 Agent 工具
- 本地优先存储

Camo 的首个版本应重点完成“可用闭环”，而不是追求复杂功能。第一版目标是让用户可以看到 Camo、点击 Camo、与 Camo 对话、设置提醒，并在提醒触发时看到 Camo 状态变化和气泡提示。

---

## 2. 目标用户

### 2.1 核心用户

1. 长时间使用电脑的学生、开发者、研究人员。
2. 需要轻量事务提醒的人。
3. 希望桌面上有一个可爱但不打扰的个人助手的人。
4. 希望接入 LLM 问答，但不想打开复杂聊天窗口的人。

### 2.2 使用场景

1. 用户正在写代码或论文，希望快速向 Camo 提问。
2. 用户希望设置“明天上午 10 点提醒我喝水”。
3. 用户希望每隔一段时间被提醒喝水。
4. 用户希望久坐时进行健康训练提醒。
5. 用户希望桌面上有一个轻量陪伴型助手，而不是完整聊天应用。

---

## 3. 产品核心价值

Camo 的核心价值是：

> 用一个低资源、常驻桌面、状态可视化的 Q 版机器人，把 LLM 问答、事务提醒和健康习惯提醒整合成一个轻量个人助手。

它相比普通提醒软件的差异在于：

1. 通过自然语言创建提醒。
2. 通过桌宠状态表达当前任务。
3. 通过角色形象降低提醒的生硬感。
4. 通过 LLM 提供问答与简单任务理解能力。
5. 默认本地保存设置和提醒数据，减少复杂依赖。

---

## 4. Camo 角色设定

### 4.1 角色名称

角色名称：Camo

### 4.2 角色形象

Camo 是一个 Q 版团子小机器人，整体风格为：

- 圆润
- 简洁
- 可爱
- 紫色主视觉
- 轻科技感
- 无攻击性
- 适合小尺寸显示
- 适合透明背景悬浮

### 4.3 角色性格

Camo 的性格设定：

- 温和
- 聪明
- 简短
- 不打扰
- 可靠
- 有一点可爱，但不过分幼稚

### 4.4 说话风格

Camo 的语言应该短、明确、轻量。

示例：

- “我来看看。”
- “已经记下了。”
- “该喝水了，喝几口再继续。”
- “到时间了，记得处理这件事。”
- “该做一分钟放松训练了。”
- “完成了。”

避免：

- 大段废话
- 过度拟人
- 过度卖萌
- 频繁主动打扰
- 复杂心理安慰式表达

---

## 5. 角色素材规划

当前素材目录假定为：

```text
Camo/Camo_asset/
```

建议将素材整理为以下命名：

```text
Camo/Camo_asset/
├─ camo_idle.png
├─ camo_happy.png
├─ camo_thinking.png
├─ camo_answering.png
├─ camo_reminder.png
├─ camo_water.png
├─ camo_exercise.png
├─ camo_sleepy.png
├─ camo_done.png
└─ camo_icon.png
```

如果当前素材文件名不一致，开发时应先建立一个映射文件，而不是强行依赖文件原名。

推荐建立：

```text
src/assets/camo/manifest.ts
```

内容用于统一管理状态和图片路径。

---

## 6. Camo 状态设计

### 6.1 状态列表

| 状态 | 文件 | 触发场景 |
|---|---|---|
| idle | camo_idle.png | 默认待机 |
| happy | camo_happy.png | 欢迎、确认、轻松反馈 |
| thinking | camo_thinking.png | 用户提交问题后，LLM 响应前 |
| answering | camo_answering.png | LLM 正在回答 |
| reminder | camo_reminder.png | 普通事务提醒 |
| water | camo_water.png | 喝水提醒 |
| exercise | camo_exercise.png | 健康训练提醒 |
| sleepy | camo_sleepy.png | 长时间无交互 |
| done | camo_done.png | 用户点击完成任务 |
| icon | camo_icon.png | 应用图标、托盘图标 |

### 6.2 状态流转

```text
默认启动
→ idle

用户点击 Camo
→ happy / listening

用户输入问题
→ thinking

LLM 开始输出
→ answering

LLM 输出结束
→ idle

提醒触发
→ reminder / water / exercise

用户点击完成
→ done
→ idle

长时间无操作
→ sleepy

用户再次交互
→ idle / happy
```

---

## 7. 功能模块设计

### 7.1 桌宠悬浮窗

功能要求：

1. 显示 Camo 角色。
2. 背景透明。
3. 无边框。
4. 可拖动。
5. 可置顶。
6. 默认显示在桌面右下角。
7. 点击后打开聊天 / 快捷输入面板。
8. 右键或托盘提供菜单。

建议交互：

- 单击 Camo：打开迷你输入框。
- 双击 Camo：打开完整聊天窗口。
- 右键 Camo：显示快捷菜单。
- 拖动 Camo：移动位置。
- 长时间无操作：进入 sleepy 状态。

---

### 7.2 聊天问答

第一版只需要轻量问答，不需要复杂多轮 Agent。

功能要求：

1. 用户输入问题。
2. Camo 切换到 thinking。
3. 调用 LLM。
4. 流式输出时切换到 answering。
5. 输出结束后恢复 idle。
6. 聊天记录本地保存。
7. 支持基础模型配置。

支持的 LLM Provider：

1. OpenAI-compatible API。
2. Ollama 本地模型。
3. 后续可扩展 DeepSeek、Qwen、Claude 等。

---

### 7.3 自然语言提醒

用户可以输入：

- “明天上午 10 点提醒我喝水。”
- “每天 9 点提醒我查看实验结果。”
- “每隔 1 小时提醒我喝水。”
- “下午 3 点提醒我开会。”
- “每天下午 4 点提醒我活动一下。”

系统处理流程：

```text
用户输入
→ 判断是否为提醒意图
→ LLM 或规则解析为结构化提醒
→ 写入 SQLite
→ 注册调度任务
→ Camo 返回确认
```

提醒触发时：

```text
调度器触发
→ 读取提醒类型
→ 切换 Camo 状态
→ 弹出气泡
→ 显示按钮：完成 / 稍后 / 跳过
```

---

### 7.4 喝水提醒

喝水提醒是内置习惯提醒。

默认设置建议：

```text
开始时间：09:00
结束时间：22:00
间隔：60 分钟
是否启用：默认关闭，由用户开启
```

提醒文案：

- “该喝水了，喝几口再继续。”
- “补充一点水分。”
- “休息一下，喝口水。”

用户操作：

- 完成
- 稍后 10 分钟
- 今天暂停
- 关闭喝水提醒

---

### 7.5 健康训练提醒

这里不建议在正式 UI 中直接突出“提肛提醒”四个字，可以在产品层命名为：

- 健康训练
- 久坐放松
- 核心放松
- 隐私训练

内部类型仍可用：

```text
exercise
```

默认设置建议：

```text
每天 3 次
10:30
15:30
21:00
默认关闭，由用户开启
```

提醒文案：

- “该做一分钟放松训练了。”
- “久坐一会儿了，做个简短训练。”
- “开始 60 秒健康训练。”

用户操作：

- 开始 60 秒
- 完成
- 稍后提醒
- 今天跳过

---

### 7.6 托盘菜单

托盘菜单建议包含：

```text
打开 Camo
打开聊天窗口
今日提醒
喝水提醒：开 / 关
健康训练：开 / 关
暂停所有提醒 1 小时
设置
退出
```

---

### 7.7 设置页

第一版设置页包含：

1. LLM 设置。
2. Camo 显示设置。
3. 喝水提醒设置。
4. 健康训练设置。
5. 普通提醒列表。
6. 开机自启。
7. 数据清理。

LLM 设置：

```text
Provider:
- OpenAI Compatible
- Ollama

Base URL
API Key
Model Name
Temperature
Streaming
```

Camo 设置：

```text
是否置顶
是否开机启动
默认位置
透明悬浮窗
无交互多久进入 sleepy
动画强度：关闭 / 低 / 标准
```

---

## 8. UI 设计原则

### 8.1 视觉风格

主风格：

- 紫色系
- 白色背景
- 圆角
- 轻阴影
- 半透明
- 低饱和
- 简洁卡片

建议颜色：

```text
主色：#8B5CF6
深紫：#5B21B6
浅紫：#EDE9FE
背景：#FAF7FF
文字：#2E2157
弱文字：#7C6BAE
成功：#7DD3A8
提醒：#FACC15
错误：#F87171
```

### 8.2 桌宠窗口

桌宠窗口应该尽可能轻：

```text
透明背景
无额外边框
不显示大面积 UI
只显示 Camo + 必要气泡
```

### 8.3 聊天窗口

聊天窗口可以是一个小型浮层：

```text
宽度：360px
高度：480px
圆角：20px
背景：白色 / 淡紫
输入框底部固定
支持流式输出
```

### 8.4 提醒气泡

提醒气泡要短：

```text
标题：喝水提醒
内容：该喝水了，喝几口再继续。
按钮：完成 / 稍后
```

不要让气泡过大，也不要遮挡桌面主要内容。

---

## 9. 数据设计

### 9.1 Reminder

```ts
interface Reminder {
  id: string;
  title: string;
  type: "normal" | "water" | "exercise";
  scheduleKind: "once" | "interval" | "daily" | "fixedTimes";
  schedulePayload: Record<string, unknown>;
  nextRunAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 9.2 ChatMessage

```ts
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}
```

### 9.3 Settings

```ts
interface Settings {
  llmProvider: "openai-compatible" | "ollama";
  llmBaseUrl: string;
  llmApiKey?: string;
  llmModel: string;
  alwaysOnTop: boolean;
  autoStart: boolean;
  animationLevel: "off" | "low" | "standard";
  sleepyAfterMinutes: number;
}
```

---

## 10. MVP 范围

第一版必须完成：

1. Camo 透明悬浮窗。
2. Camo 状态切换。
3. 点击打开聊天输入。
4. LLM 问答。
5. 普通提醒创建。
6. 喝水提醒。
7. 健康训练提醒。
8. SQLite 本地保存。
9. 托盘菜单。
10. 设置页基础配置。

第一版暂不做：

1. 语音输入。
2. 复杂多 Agent。
3. 插件市场。
4. 云同步。
5. Live2D。
6. 复杂动画。
7. 文件问答。
8. 日历邮件自动操作。

---

## 11. 后续扩展方向

后续可以扩展：

1. Camo 皮肤系统。
2. 插件系统。
3. 本地长期记忆。
4. 日历接入。
5. 文件问答。
6. 浏览器搜索。
7. 语音唤醒。
8. 更多动作动画。
9. 用户自定义提醒语气。
10. npm 插件生态。

---

## 12. 产品验收标准

MVP 产品验收标准：

1. 应用启动后，Camo 可以显示在桌面上。
2. Camo 窗口透明、无边框、可拖动。
3. 点击 Camo 可以打开聊天输入框。
4. 用户输入普通问题后，可以得到 LLM 回答。
5. 用户输入提醒请求后，可以创建提醒。
6. 提醒到点后，Camo 状态发生变化并显示气泡。
7. 喝水提醒和健康训练提醒可以开启、关闭、稍后提醒。
8. 应用重启后，提醒和设置仍然存在。
9. 托盘菜单可用。
10. 应用在空闲状态下资源占用较低。
