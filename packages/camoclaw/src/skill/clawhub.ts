const CLAWHUB_API = "https://clawhub.ai/api/v1";

export interface ClawHubSearchResult {
  slug: string;
  displayName: string;
  summary: string;
  version: string;
  updatedAt: string;
  ownerHandle: string;
  owner: string;
  score: number;
  downloads?: number;
  stars?: number;
}

export interface ClawHubSkillDetail {
  slug: string;
  displayName: string;
  summary: string;
  description: string;
  version: string;
  updatedAt: string;
  owner: string;
  ownerHandle: string;
  tags: string[];
  downloads: number;
  stars: number;
}

interface ClawHubListResponse {
  items: ClawHubSearchResult[];
  nextCursor?: string;
}

interface ClawHubSearchResponse {
  results: ClawHubSearchResult[];
}

async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CLAWHUB_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ClawHub API 错误: ${response.status} ${text}`);
  }
  return response.json();
}

export const clawhub = {
  async search(query: string, limit = 20): Promise<ClawHubSearchResult[]> {
    const data = await fetchApi<ClawHubSearchResponse>("/search", { q: query, limit: String(limit) });
    return data.results || [];
  },

  async listSkills(sort = "downloads", limit = 20): Promise<{ items: ClawHubSearchResult[]; nextCursor?: string }> {
    const data = await fetchApi<ClawHubListResponse>("/skills", { sort, limit: String(limit) });
    return { items: data.items || [], nextCursor: data.nextCursor };
  },

  async getDetail(slug: string): Promise<ClawHubSkillDetail | null> {
    try {
      const data = await fetchApi<{ skill: ClawHubSkillDetail }>(`/skills/${slug}`);
      return data.skill || null;
    } catch {
      return null;
    }
  },

  async fetchSkillFile(slug: string, path = "SKILL.md"): Promise<string> {
    const url = `${CLAWHUB_API}/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.status}`);
    }
    return response.text();
  },

  async downloadZip(slug: string, version?: string): Promise<Response> {
    const url = new URL(`${CLAWHUB_API}/download`);
    url.searchParams.set("slug", slug);
    if (version) url.searchParams.set("version", version);
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    return response;
  },
};
