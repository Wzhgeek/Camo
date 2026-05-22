<script setup lang="ts">
import { ref } from "vue";
import { useSkillStore } from "../stores/skillStore";
import type { Skill } from "../core/skill/skillService";
import { toolRegistry } from "../core/tools/registry";
import { clawhub, type ClawHubSearchResult } from "../core/skill/clawhub";
import { parseSkillMarkdown } from "../core/skill/parser";
import { writeSkillToDisk } from "../core/skill/fsSync";
import { isTauri } from "../core/platform";

const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ standalone?: boolean; locked?: boolean }>();

const skillStore = useSkillStore();

// ── Tab state ──
type TabKind = "mine" | "browse";
const activeTab = ref<TabKind>("mine");

// ── Mine tab state ──
const editingId = ref<string | null>(null);
const showNewForm = ref(false);
const newForm = ref({
  name: "",
  title: "",
  description: "",
  prompt: "",
  tools: [] as string[],
  autoTriggerWords: [] as string[],
});
const allToolNames = toolRegistry.listNames();

// ── Browse tab state ──
const searchQuery = ref("");
const browseResults = ref<ClawHubSearchResult[]>([]);
const browseLoading = ref(false);
const browseSort = ref("downloads");
const installingSlug = ref<string | null>(null);
const installedSlugs = ref<Set<string>>(new Set(
  skillStore.skills.filter(s => !s.builtIn).map(s => s.name),
));

function startDrag() {
  if (isTauri) {
    tauriWindow!.then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
  }
}

// ── Mine tab functions ──
function toggleTool(toolName: string) {
  const idx = newForm.value.tools.indexOf(toolName);
  if (idx === -1) newForm.value.tools.push(toolName);
  else newForm.value.tools.splice(idx, 1);
}

function resetNewForm() {
  newForm.value = { name: "", title: "", description: "", prompt: "", tools: [], autoTriggerWords: [] };
  showNewForm.value = false;
}

function createSkill() {
  if (!newForm.value.name.trim() || !newForm.value.title.trim()) return;
  skillStore.create({
    name: newForm.value.name.trim(),
    title: newForm.value.title.trim(),
    description: newForm.value.description.trim(),
    prompt: newForm.value.prompt.trim(),
    tools: newForm.value.tools,
    autoTriggerWords: newForm.value.autoTriggerWords.filter(w => w.trim()),
  });
  resetNewForm();
}

function deleteSkill(skill: Skill) {
  if (skill.builtIn) return;
  skillStore.remove(skill.id);
}

function toggleEnabled(skill: Skill) {
  skillStore.update(skill.id, { enabled: !skill.enabled });
}

function editField(skill: Skill, field: string, value: unknown) {
  skillStore.update(skill.id, { [field]: value } as any);
}

// ── Browse tab functions ──
async function searchClawHub() {
  if (!searchQuery.value.trim()) return;
  browseLoading.value = true;
  try {
    browseResults.value = await clawhub.search(searchQuery.value.trim());
  } catch (e) {
    console.warn("ClawHub search failed:", e);
    browseResults.value = [];
  } finally {
    browseLoading.value = false;
  }
}

async function loadTrending() {
  browseLoading.value = true;
  try {
    const result = await clawhub.listSkills(browseSort.value);
    browseResults.value = result.items;
  } catch (e) {
    console.warn("ClawHub list failed:", e);
    browseResults.value = [];
  } finally {
    browseLoading.value = false;
  }
}

async function installFromClawHub(item: ClawHubSearchResult) {
  installingSlug.value = item.slug;
  try {
    const md = await clawhub.fetchSkillFile(item.slug);
    const { frontmatter } = parseSkillMarkdown(md);
    const skill = skillStore.create({
      name: frontmatter.name || item.slug,
      title: frontmatter.title || item.displayName,
      description: frontmatter.description || item.summary,
      prompt: frontmatter.prompt || md,
      tools: frontmatter.tools.length > 0 ? frontmatter.tools : allToolNames,
      autoTriggerWords: frontmatter.autoTriggerWords || [],
    });
    // Write to disk
    writeSkillToDisk(skill).catch(() => {});
    installedSlugs.value.add(item.slug);
  } catch (e) {
    console.warn("Install failed:", e);
  } finally {
    installingSlug.value = null;
  }
}

function isInstalled(item: ClawHubSearchResult): boolean {
  return installedSlugs.value.has(item.slug);
}

// Load trending on browse tab open
function onTabChange(tab: TabKind) {
  activeTab.value = tab;
  if (tab === "browse" && browseResults.value.length === 0) {
    loadTrending();
  }
}
</script>

<template>
  <section data-camo-surface class="skill-panel" :class="{ standalone }">
    <header class="skill-title" @pointerdown="locked ? undefined : startDrag()">
      <strong>技能管理</strong>
      <button @click="emit('close')">×</button>
    </header>

    <!-- Tabs -->
    <div class="skill-tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'mine' }" @click="onTabChange('mine')">我的 Skill</button>
      <button class="tab-btn" :class="{ active: activeTab === 'browse' }" @click="onTabChange('browse')">浏览</button>
    </div>

    <div class="skill-body">
      <!-- ═══ 我的 Skill Tab ═══ -->
      <template v-if="activeTab === 'mine'">
        <div class="skill-toolbar">
          <button class="primary" @click="showNewForm = !showNewForm">
            {{ showNewForm ? "取消" : "新建 Skill" }}
          </button>
        </div>

        <div v-if="showNewForm" class="skill-form">
          <label>标识符 <input v-model="newForm.name" placeholder="如 git-helper" /></label>
          <label>显示名称 <input v-model="newForm.title" placeholder="如 Git 助手" /></label>
          <label>描述 <input v-model="newForm.description" placeholder="一句话描述这个 Skill 的功能" /></label>
          <label>系统提示词 <textarea v-model="newForm.prompt" rows="4" placeholder="定义此 Skill 的行为和角色" /></label>
          <label>触发词（逗号分隔） <input
            :value="newForm.autoTriggerWords.join(', ')"
            @change="(e) => { newForm.autoTriggerWords = (e.target as HTMLInputElement).value.split(',').map(w => w.trim()).filter(Boolean); }"
            placeholder="git, 提交, 分支"
          /></label>
          <div class="tool-checkboxes">
            <span class="label-text">可用工具</span>
            <label v-for="t in allToolNames" :key="t" class="tool-check">
              <input type="checkbox" :checked="newForm.tools.includes(t)" @change="toggleTool(t)" />
              {{ t }}
            </label>
          </div>
          <button class="primary" :disabled="!newForm.name.trim() || !newForm.title.trim()" @click="createSkill">创建</button>
        </div>

        <div class="skill-list">
          <article v-for="skill in skillStore.skills" :key="skill.id" class="skill-row" :class="{ builtin: skill.builtIn, editing: editingId === skill.id }">
            <div class="skill-info">
              <div class="skill-row-header">
                <span class="skill-row-title">{{ skill.title }}</span>
                <span class="skill-row-name">({{ skill.name }})</span>
                <span v-if="skill.builtIn" class="builtin-badge">内置</span>
                <span v-if="skill.id === skillStore.activeSkillId" class="active-badge">当前</span>
              </div>
              <p class="skill-row-desc">{{ skill.description }}</p>
              <div class="skill-row-tools">
                <span v-for="t in skill.tools" :key="t" class="tool-tag">{{ t }}</span>
                <span v-if="skill.tools.length === 0" class="no-tools">无工具</span>
              </div>
            </div>
            <div class="skill-row-actions">
              <label class="toggle-label">
                <input type="checkbox" :checked="skill.enabled" @change="toggleEnabled(skill)" />
                {{ skill.enabled ? '启用' : '禁用' }}
              </label>
              <button @click="skillStore.setActive(skill.id)">激活</button>
              <button @click="editingId === skill.id ? editingId = null : editingId = skill.id">
                {{ editingId === skill.id ? '完成' : '编辑' }}
              </button>
              <button v-if="!skill.builtIn" class="danger" @click="deleteSkill(skill)">删除</button>
            </div>

            <div v-if="editingId === skill.id" class="skill-edit">
              <label>显示名称 <input :value="skill.title" @change="editField(skill, 'title', ($event.target as HTMLInputElement).value)" /></label>
              <label>描述 <input :value="skill.description" @change="editField(skill, 'description', ($event.target as HTMLInputElement).value)" /></label>
              <label>系统提示词 <textarea :value="skill.prompt" rows="4" @change="editField(skill, 'prompt', ($event.target as HTMLTextAreaElement).value)" /></label>
            </div>
          </article>
          <p v-if="skillStore.skills.length === 0" class="empty-hint">暂无 Skill。点击"新建 Skill"创建第一个。</p>
        </div>
      </template>

      <!-- ═══ 浏览 Tab (ClawHub) ═══ -->
      <template v-if="activeTab === 'browse'">
        <div class="browse-bar">
          <div class="search-row">
            <input
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索 ClawHub Skill..."
              @keydown.enter="searchClawHub"
            />
            <button class="primary" @click="searchClawHub" :disabled="browseLoading">搜索</button>
          </div>
          <div class="sort-row">
            <label class="sort-label">
              排序:
              <select v-model="browseSort" @change="loadTrending">
                <option value="downloads">最多下载</option>
                <option value="stars">最多星标</option>
                <option value="trending">趋势</option>
                <option value="updated">最近更新</option>
                <option value="newest">最新</option>
              </select>
            </label>
            <button class="refresh-btn" @click="loadTrending" :disabled="browseLoading">刷新</button>
          </div>
        </div>

        <div class="browse-list">
          <div v-if="browseLoading" class="browse-loading">加载中...</div>
          <article v-for="item in browseResults" :key="item.slug" class="browse-row">
            <div class="browse-info">
              <div class="browse-header">
                <span class="browse-title">{{ item.displayName }}</span>
                <span class="browse-slug">{{ item.slug }}</span>
                <span v-if="item.version" class="browse-version">v{{ item.version }}</span>
              </div>
              <p class="browse-desc">{{ item.summary }}</p>
              <div class="browse-meta">
                <span>{{ item.ownerHandle ? '@' + item.ownerHandle : item.owner }}</span>
                <span v-if="item.downloads !== undefined">{{ item.downloads }} 下载</span>
                <span v-if="item.stars !== undefined">{{ item.stars }} ⭐</span>
              </div>
            </div>
            <div class="browse-actions">
              <button
                v-if="isInstalled(item)"
                class="installed-btn"
                disabled
              >已安装</button>
              <button
                v-else
                class="primary install-btn"
                :disabled="installingSlug === item.slug"
                @click="installFromClawHub(item)"
              >
                {{ installingSlug === item.slug ? '安装中...' : '安装' }}
              </button>
            </div>
          </article>
          <p v-if="!browseLoading && browseResults.length === 0" class="empty-hint">
            {{ searchQuery ? '未找到结果，试试其他关键词' : '点击"刷新"加载热门 Skill' }}
          </p>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ── Layout ── */
.skill-panel {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background: color-mix(in srgb, var(--camo-surface-strong) var(--camo-tool-opacity-pct), transparent);
  color: var(--camo-text);
  border: 1px solid var(--camo-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: 12px;
}
.skill-title {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--camo-border);
  user-select: none;
  font-size: 13px;
}
.skill-title button {
  border: 0;
  background: transparent;
  font-size: 16px;
  padding: 2px 6px;
  color: var(--camo-text);
  cursor: pointer;
}

/* ── Tabs ── */
.skill-tabs {
  display: flex;
  border-bottom: 1px solid var(--camo-border);
}
.tab-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--camo-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn.active {
  color: var(--camo-primary);
  border-bottom-color: var(--camo-primary);
}
.tab-btn:hover:not(.active) {
  color: var(--camo-text);
}

.skill-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

/* ── Mine tab ── */
.skill-toolbar {
  padding: 8px 10px;
  display: flex;
  gap: 8px;
}
.skill-form {
  padding: 10px;
  display: grid;
  gap: 8px;
  border-bottom: 1px solid var(--camo-border);
  background: color-mix(in srgb, var(--camo-surface) 60%, transparent);
}
.skill-form label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--camo-muted);
}
.skill-form input, .skill-form textarea, .skill-edit input, .skill-edit textarea {
  border: 1px solid var(--camo-border);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 12px;
}
.tool-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.label-text {
  width: 100%;
  font-size: 11px;
  color: var(--camo-muted);
}
.tool-check {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--camo-border);
  border-radius: 12px;
  cursor: pointer;
}
.skill-list {
  overflow: auto;
  padding: 8px 10px;
  display: grid;
  gap: 8px;
  flex: 1;
}
.skill-row {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--camo-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--camo-surface) 82%, transparent);
}
.skill-row.builtin {
  border-color: rgba(59,130,246,0.2);
}
.skill-row-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.skill-row-title { font-weight: 600; font-size: 13px; }
.skill-row-name { color: var(--camo-muted); font-family: monospace; font-size: 11px; }
.builtin-badge {
  padding: 1px 8px; border-radius: 999px; font-size: 10px;
  background: rgba(59,130,246,0.1); color: #2563eb; font-weight: 600;
}
.active-badge {
  padding: 1px 8px; border-radius: 999px; font-size: 10px;
  background: rgba(5,150,105,0.1); color: #059669; font-weight: 600;
}
.skill-row-desc { margin: 0; color: var(--camo-muted); font-size: 11px; }
.skill-row-tools { display: flex; flex-wrap: wrap; gap: 4px; }
.tool-tag {
  padding: 2px 6px; border-radius: 4px; font-size: 10px;
  background: rgba(0,0,0,0.06); color: var(--camo-muted); font-family: monospace;
}
.no-tools { color: var(--camo-muted); font-size: 11px; }
.skill-row-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.skill-row-actions button,
.skill-form button.primary,
.skill-toolbar button {
  border: 1px solid var(--camo-border);
  background: var(--camo-surface);
  color: var(--camo-text);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.25;
}
.primary {
  background: var(--camo-primary) !important;
  border-color: var(--camo-primary) !important;
  color: #fff !important;
}
.primary:disabled { opacity: 0.5; cursor: default; }
.danger { color: #d92d20 !important; }
.toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--camo-muted);
}
.skill-edit {
  display: grid;
  gap: 6px;
  padding: 8px;
  background: color-mix(in srgb, var(--camo-surface) 80%, transparent);
  border-radius: 8px;
}
.skill-edit label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--camo-muted);
}

/* ── Browse tab ── */
.browse-bar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--camo-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.search-row {
  display: flex;
  gap: 6px;
}
.search-input {
  flex: 1;
  border: 1px solid var(--camo-border);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 12px;
}
.sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sort-label {
  font-size: 11px;
  color: var(--camo-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}
.sort-label select {
  border: 1px solid var(--camo-border);
  border-radius: 4px;
  padding: 2px 4px;
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 11px;
}
.refresh-btn {
  border: 1px solid var(--camo-border);
  background: var(--camo-surface);
  color: var(--camo-text);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 11px;
}
.browse-list {
  overflow: auto;
  padding: 8px 10px;
  display: grid;
  gap: 8px;
  flex: 1;
}
.browse-loading {
  text-align: center;
  color: var(--camo-muted);
  padding: 20px;
}
.browse-row {
  display: flex;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--camo-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--camo-surface) 82%, transparent);
  align-items: flex-start;
}
.browse-info {
  flex: 1;
  display: grid;
  gap: 4px;
}
.browse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.browse-title { font-weight: 600; font-size: 13px; }
.browse-slug { color: var(--camo-muted); font-family: monospace; font-size: 11px; }
.browse-version {
  padding: 1px 6px; border-radius: 4px; font-size: 10px;
  background: rgba(59,130,246,0.08); color: #2563eb;
}
.browse-desc { margin: 0; color: var(--camo-muted); font-size: 11px; }
.browse-meta {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: var(--camo-muted);
}
.browse-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.install-btn {
  padding: 5px 14px;
}
.installed-btn {
  padding: 5px 14px;
  border: 1px solid rgba(5,150,105,0.3);
  background: rgba(5,150,105,0.06);
  color: #059669;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}
.empty-hint {
  text-align: center;
  color: var(--camo-muted);
  padding: 20px;
}
</style>
