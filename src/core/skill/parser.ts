export interface SkillFrontmatter {
  name: string;
  title: string;
  description: string;
  prompt: string;
  tools: string[];
  autoTriggerWords: string[];
  source?: string;
  clawhubSlug?: string;
  clawhubVersion?: string;
}

export function parseSkillMarkdown(md: string): { frontmatter: SkillFrontmatter; body: string } {
  const lines = md.split("\n");
  const frontmatter: Partial<SkillFrontmatter> = {};
  let body = "";
  let inFrontmatter = false;
  let frontmatterEnded = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && !frontmatterEnded) {
      if (line.trim() === "---") {
        frontmatterEnded = true;
        inFrontmatter = false;
        continue;
      }
      // Parse key: value (simple YAML subset)
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (key === "tools" || key === "autoTriggerWords") {
        // These are arrays; collect from subsequent lines starting with "  - "
        const arr: string[] = [];
        if (value === "") {
          // Multi-line array
          let j = i + 1;
          while (j < lines.length && lines[j].trim().startsWith("- ")) {
            arr.push(lines[j].trim().slice(2));
            j++;
          }
          i = j - 1;
        }
        (frontmatter as Record<string, unknown>)[key] = arr;
      } else {
        (frontmatter as Record<string, unknown>)[key] = value;
      }
    } else {
      body += (body ? "\n" : "") + line;
    }
  }

  return {
    frontmatter: {
      name: frontmatter.name || "",
      title: frontmatter.title || frontmatter.name || "",
      description: frontmatter.description || "",
      prompt: body.trim(),
      tools: (frontmatter.tools as string[]) || [],
      autoTriggerWords: (frontmatter.autoTriggerWords as string[]) || [],
      source: frontmatter.source,
      clawhubSlug: frontmatter.clawhubSlug,
      clawhubVersion: frontmatter.clawhubVersion,
    },
    body: body.trim(),
  };
}

export function serializeSkillMarkdown(fm: SkillFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${fm.name}`);
  lines.push(`title: ${fm.title}`);
  lines.push(`description: ${fm.description}`);
  if (fm.source) lines.push(`source: ${fm.source}`);
  if (fm.clawhubSlug) lines.push(`clawhubSlug: ${fm.clawhubSlug}`);
  if (fm.clawhubVersion) lines.push(`clawhubVersion: ${fm.clawhubVersion}`);

  if (fm.tools.length > 0) {
    lines.push("tools:");
    for (const t of fm.tools) lines.push(`  - ${t}`);
  }
  if (fm.autoTriggerWords.length > 0) {
    lines.push("autoTriggerWords:");
    for (const w of fm.autoTriggerWords) lines.push(`  - ${w}`);
  }

  lines.push("---");
  lines.push("");
  lines.push(fm.prompt);
  return lines.join("\n") + "\n";
}
