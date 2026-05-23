import type { Skill } from "./skillService.js";

export function matchSkill(userMessage: string, skills: Skill[]): Skill | undefined {
  const lower = userMessage.toLowerCase();
  // Find the first enabled skill whose autoTriggerWords match
  for (const skill of skills) {
    if (!skill.enabled || skill.autoTriggerWords.length === 0) continue;
    if (skill.autoTriggerWords.some(word => lower.includes(word.toLowerCase()))) {
      return skill;
    }
  }
  // Fallback to general skill
  return skills.find(s => s.name === "general" && s.enabled);
}
