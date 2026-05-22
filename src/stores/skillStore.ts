import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { skillService, type Skill } from "../core/skill/skillService";
import { matchSkill } from "../core/skill/matcher";

export const useSkillStore = defineStore("skill", () => {
  const skills = ref<Skill[]>([]);
  const activeSkillId = ref<string | null>(null);

  function refresh(): void {
    skills.value = skillService.list();
  }

  function reload(): void {
    refresh();
  }

  const activeSkill = computed<Skill | undefined>(() => {
    if (activeSkillId.value) {
      return skills.value.find(s => s.id === activeSkillId.value) ?? skills.value.find(s => s.name === "general");
    }
    return skills.value.find(s => s.name === "general");
  });

  function setActive(skillId: string): void {
    activeSkillId.value = skillId;
  }

  function resetActive(): void {
    activeSkillId.value = null;
  }

  function create(input: {
    name: string;
    title: string;
    description: string;
    prompt: string;
    tools: string[];
    autoTriggerWords: string[];
  }): Skill {
    const skill = skillService.create(input);
    refresh();
    return skill;
  }

  function update(id: string, patch: Partial<Pick<Skill, "name" | "title" | "description" | "prompt" | "tools" | "autoTriggerWords" | "enabled">>): Skill | null {
    const skill = skillService.update(id, patch);
    if (skill) refresh();
    return skill;
  }

  function remove(id: string): boolean {
    const ok = skillService.delete(id);
    if (ok) refresh();
    return ok;
  }

  function matchAndSetActive(userMessage: string): Skill {
    const matched = matchSkill(userMessage, skills.value);
    if (matched && matched.id !== activeSkillId.value) {
      activeSkillId.value = matched.id;
    }
    return matched ?? (skills.value.find(s => s.name === "general")!);
  }

  function getSkillTools(skill: Skill): string[] {
    return skill.tools;
  }

  // Initial load
  skillService.ensureBuiltins();
  refresh();

  // Sync from ~/.camoclaw/skills/ on startup
  import("../core/skill/fsSync").then(({ syncSkillsFromDisk }) => {
    syncSkillsFromDisk().then(() => refresh());
  });

  return {
    skills,
    activeSkillId,
    activeSkill,
    refresh: reload,
    setActive,
    resetActive,
    create,
    update,
    remove,
    matchAndSetActive,
    getSkillTools,
  };
});
