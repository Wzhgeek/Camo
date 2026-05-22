import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../platform";
import { skillService, type Skill } from "./skillService";
import { parseSkillMarkdown, serializeSkillMarkdown, type SkillFrontmatter } from "./parser";

const SKILL_MD = "SKILL.md";
const META_FILE = ".camoclaw.json";

async function ensureDir(): Promise<string> {
  if (isTauri) {
    return invoke<string>("ensure_camoclaw_dir");
  }
  return "";
}

async function listDirs(): Promise<string[]> {
  if (isTauri) {
    return invoke<string[]>("list_skill_dirs");
  }
  return [];
}

async function readFile(path: string): Promise<string> {
  if (isTauri) {
    return invoke<string>("read_skill_file", { path });
  }
  return "";
}

async function writeFile(path: string, content: string): Promise<void> {
  if (isTauri) {
    await invoke("write_skill_file", { path, content });
  }
}

async function deleteDir(name: string): Promise<void> {
  if (isTauri) {
    await invoke("delete_skill_dir", { name });
  }
}

/** Read a single Skill from disk by directory name */
export async function readSkillFromDisk(name: string): Promise<SkillFrontmatter | null> {
  try {
    const baseDir = await ensureDir();
    const mdPath = `${baseDir}/${name}/${SKILL_MD}`;
    const content = await readFile(mdPath);
    if (!content) return null;
    const { frontmatter } = parseSkillMarkdown(content);
    return frontmatter;
  } catch {
    return null;
  }
}

/** Write a Skill to disk */
export async function writeSkillToDisk(skill: Skill): Promise<void> {
  const baseDir = await ensureDir();
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
  await writeFile(mdPath, md);

  await writeFile(metaPath, JSON.stringify({
    slug: skill.name,
    installedAt: skill.createdAt,
  }, null, 2));
}

/** Delete a Skill directory from disk */
export async function deleteSkillFromDisk(name: string): Promise<void> {
  if (!isTauri) return;
  await deleteDir(name);
}

/** Sync skills from disk to SQLite. Returns list of skill names found on disk. */
export async function syncSkillsFromDisk(): Promise<string[]> {
  if (!isTauri) return [];

  await ensureDir();
  const dirs = await listDirs();
  const names: string[] = [];

  for (const dirName of dirs) {
    try {
      const baseDir = await ensureDir();
      const mdPath = `${baseDir}/${dirName}/${SKILL_MD}`;
      const metaPath = `${baseDir}/${dirName}/${META_FILE}`;

      const mdContent = await readFile(mdPath);
      if (!mdContent) continue;

      const { frontmatter } = parseSkillMarkdown(mdContent);
      if (!frontmatter.name) continue;

      // Read metadata if available (for future update checking)
      try {
        const metaContent = await readFile(metaPath);
        if (metaContent) JSON.parse(metaContent);
      } catch { /* meta file optional */ }

      const existing = skillService.getByName(frontmatter.name);
      if (existing) {
        // Update existing skill with file content
        skillService.update(existing.id, {
          title: frontmatter.title,
          description: frontmatter.description,
          prompt: frontmatter.prompt,
          tools: frontmatter.tools,
          autoTriggerWords: frontmatter.autoTriggerWords,
        });
      } else {
        // Create new skill from file
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
    } catch {
      // Skip malformed skill directories
    }
  }

  return names;
}
