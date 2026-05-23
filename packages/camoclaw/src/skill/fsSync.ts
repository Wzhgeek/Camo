import { isTauri } from "../platform.js";
import { skillService, type Skill } from "./skillService.js";
import { parseSkillMarkdown, serializeSkillMarkdown, type SkillFrontmatter } from "./parser.js";

const SKILL_MD = "SKILL.md";
const META_FILE = ".camoclaw.json";

// These functions are platform-specific and must be injected
let fsImpl: {
  ensureDir(): Promise<string>;
  listDirs(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteDir(name: string): Promise<void>;
} | null = null;

export interface CamoclawFS {
  ensureDir(): Promise<string>;
  listDirs(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteDir(name: string): Promise<void>;
}

export function setCamoclawFS(fs: CamoclawFS): void {
  fsImpl = fs;
}

async function ensureFs(): Promise<CamoclawFS> {
  if (fsImpl) return fsImpl;

  // Auto-initialize for Tauri
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    fsImpl = {
      ensureDir: () => invoke<string>("ensure_camoclaw_dir"),
      listDirs: () => invoke<string[]>("list_skill_dirs"),
      readFile: (path: string) => invoke<string>("read_skill_file", { path }),
      writeFile: (path: string, content: string) => invoke("write_skill_file", { path, content }),
      deleteDir: (name: string) => invoke("delete_skill_dir", { name }),
    };
    return fsImpl;
  }

  throw new Error("CamoclawFS not initialized. Call setCamoclawFS() first, or run in Tauri environment.");
}

async function getFS(): Promise<CamoclawFS> {
  return fsImpl ?? ensureFs();
}

export async function readSkillFromDisk(name: string): Promise<SkillFrontmatter | null> {
  try {
    const fs = await getFS();
    const baseDir = await fs.ensureDir();
    const mdPath = `${baseDir}/${name}/${SKILL_MD}`;
    const content = await fs.readFile(mdPath);
    if (!content) return null;
    const { frontmatter } = parseSkillMarkdown(content);
    return frontmatter;
  } catch {
    return null;
  }
}

export async function writeSkillToDisk(skill: Skill): Promise<void> {
  const fs = await getFS();
  const baseDir = await fs.ensureDir();
  const mdPath = `${baseDir}/${skill.name}/${SKILL_MD}`;
  const metaPath = `${baseDir}/${skill.name}/${META_FILE}`;

  const fm: SkillFrontmatter = {
    name: skill.name,
    title: skill.title,
    description: skill.description,
    prompt: skill.prompt,
    tools: skill.tools,
    autoTriggerWords: skill.autoTriggerWords,
  };

  const md = serializeSkillMarkdown(fm);
  await fs.writeFile(mdPath, md);
  await fs.writeFile(metaPath, JSON.stringify({ slug: skill.name, installedAt: skill.createdAt }, null, 2));
}

export async function deleteSkillFromDisk(name: string): Promise<void> {
  const fs = await getFS();
  await fs.deleteDir(name);
}

export async function syncSkillsFromDisk(): Promise<string[]> {
  const fs = await getFS();
  await fs.ensureDir();
  const dirs = await fs.listDirs();
  const names: string[] = [];

  for (const dirName of dirs) {
    try {
      const baseDir = await fs.ensureDir();
      const mdPath = `${baseDir}/${dirName}/${SKILL_MD}`;
      const mdContent = await fs.readFile(mdPath);
      if (!mdContent) continue;

      const { frontmatter } = parseSkillMarkdown(mdContent);
      if (!frontmatter.name) continue;

      const existing = skillService.getByName(frontmatter.name);
      if (existing) {
        skillService.update(existing.id, {
          title: frontmatter.title,
          description: frontmatter.description,
          prompt: frontmatter.prompt,
          tools: frontmatter.tools,
          autoTriggerWords: frontmatter.autoTriggerWords,
        });
      } else {
        skillService.create({
          name: frontmatter.name,
          title: frontmatter.title,
          description: frontmatter.description,
          prompt: frontmatter.prompt,
          tools: frontmatter.tools,
          autoTriggerWords: frontmatter.autoTriggerWords,
        });
      }
      names.push(frontmatter.name);
    } catch { /* skip malformed */ }
  }
  return names;
}
