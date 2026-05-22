interface BuiltinSkillInput {
  name: string;
  title: string;
  description: string;
  prompt: string;
  tools: string[];
  autoTriggerWords: string[];
}

export function getBuiltinSkills(): BuiltinSkillInput[] {
  return [
    {
      name: "general",
      title: "通用助手",
      description: "默认 Skill，可以使用所有工具，无任何限制。",
      prompt: "你是 Camo，一只可爱的桌宠助手，可以使用各种工具来帮助用户操作电脑。保持友好、亲切的语气。",
      tools: [
        "read_file", "write_file", "list_directory",
        "run_shell",
        "read_clipboard", "write_clipboard",
        "screenshot",
        "move_mouse", "click", "type_text",
        "open_url",
        "list_skills", "create_skill", "update_skill", "delete_skill", "activate_skill",
      ],
      autoTriggerWords: [],
    },
    {
      name: "file-manager",
      title: "文件管理",
      description: "专注于文件操作：读取、写入、列出目录。不会执行命令或操作剪贴板。",
      prompt: "你是文件管理助手。你可以帮助用户读取、写入和浏览文件系统中的文件。只使用文件相关工具，不要使用 Shell 或其他系统工具。",
      tools: ["read_file", "write_file", "list_directory"],
      autoTriggerWords: ["文件", "目录", "文件夹", "读写", "读取", "写入", "查看文件", "创建文件"],
    },
    {
      name: "shell-runner",
      title: "命令行",
      description: "专注于执行 Shell 命令。每次执行前会请求用户确认。",
      prompt: "你是命令行助手。你可以帮助用户执行 Shell 命令。注意：每次命令执行前都需要用户确认。解释清楚每个命令的作用，让用户知道你在做什么。",
      tools: ["run_shell"],
      autoTriggerWords: ["执行", "命令", "shell", "运行", "终端", "bash", "命令行"],
    },
    {
      name: "skill-builder",
      title: "Skill 构建器",
      description: "专门用于创建和管理 Skill。可以读取文件来参考现有 Skill 的结构。",
      prompt: "你是 Skill 构建器。你可以帮助用户创建、修改和管理 Skill。每个 Skill 包含名称、描述、系统提示词、工具白名单和触发词。设计 Skill 时要考虑：1) 触发词应该覆盖常见的用户表述 2) 工具白名单应该只包含必要的工具 3) 提示词应该清晰定义角色和能力边界。",
      tools: ["list_skills", "create_skill", "update_skill", "delete_skill", "read_file", "write_file"],
      autoTriggerWords: ["创建skill", "新建技能", "skill", "技能", "管理技能", "删除技能", "修改技能"],
    },
  ];
}
