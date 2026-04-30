import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// ========== 项目 ==========
export const listProjects = () => api.get('/projects').then(r => r.data);
export const getProject = (id) => api.get(`/projects/${id}`).then(r => r.data);
export const createProject = (data) => api.post('/projects', data).then(r => r.data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data).then(r => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// ========== 章纲 ==========
export const listOutlines = (pid) => api.get(`/projects/${pid}/outlines/chapters`).then(r => r.data);
export const getOutline = (pid, ch) => api.get(`/projects/${pid}/outlines/chapters/${ch}`).then(r => r.data);
export const updateOutline = (pid, ch, data) => api.put(`/projects/${pid}/outlines/chapters/${ch}`, data).then(r => r.data);
export const generateOutline = (pid, ch, data) => api.post(`/projects/${pid}/outlines/chapters/${ch}/generate`, data).then(r => r.data);

// ========== 场景要点 ==========
export const updateScenes = (pid, ch, data) => api.put(`/projects/${pid}/outlines/chapters/${ch}/scenes`, data).then(r => r.data);
export const deleteScene = (pid, ch, order) => api.delete(`/projects/${pid}/outlines/chapters/${ch}/scenes/${order}`);

// ========== 章节 ==========
export const listChapters = (pid) => api.get(`/projects/${pid}/chapters`).then(r => r.data);
export const getChapter = (pid, ch) => api.get(`/projects/${pid}/chapters/${ch}`).then(r => r.data);
export const updateChapter = (pid, ch, data) => api.put(`/projects/${pid}/chapters/${ch}`, data).then(r => r.data);
export const writePreview = (pid, ch) => api.post(`/projects/${pid}/chapters/${ch}/write`).then(r => r.data);
export const generateChapter = (pid, ch, data) => api.post(`/projects/${pid}/chapters/${ch}/generate`, data, { timeout: 120000 }).then(r => r.data);

// ========== 章节版本 ==========
export const listChapterVersions = (pid, ch) => api.get(`/projects/${pid}/chapters/${ch}/versions`).then(r => r.data);
export const restoreChapterVersion = (pid, ch, vid) => api.post(`/projects/${pid}/chapters/${ch}/versions/${vid}/restore`).then(r => r.data);

export const generateChapterStream = async function* (pid, ch, data) {
  const resp = await fetch(`/api/projects/${pid}/chapters/${ch}/generate-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch {}
    }
  }
};

// ========== 角色 ==========
export const listCharacters = (pid) => api.get(`/projects/${pid}/characters`).then(r => r.data);
export const createCharacter = (pid, data) => api.post(`/projects/${pid}/characters`, data).then(r => r.data);
export const updateCharacter = (pid, cid, data) => api.put(`/projects/${pid}/characters/${cid}`, data).then(r => r.data);
export const deleteCharacter = (pid, cid) => api.delete(`/projects/${pid}/characters/${cid}`);
export const getCharacterSnapshots = (pid, ch) => api.get(`/projects/${pid}/characters/snapshots`, { params: ch ? { chapter: ch } : {} }).then(r => r.data);

// ========== 风格 ==========
export const getStyle = (pid) => api.get(`/projects/${pid}/style`).then(r => r.data);
export const updateStyleParams = (pid, data) => api.put(`/projects/${pid}/style/params`, data).then(r => r.data);
export const analyzeStyle = (pid) => api.post(`/projects/${pid}/style/analyze`, {}, { timeout: 60000 }).then(r => r.data);

// ========== 伏笔 ==========
export const listForeshadowing = (pid, status) => {
  const params = status ? { status } : {};
  return api.get(`/projects/${pid}/foreshadowing`, { params }).then(r => r.data);
};
export const updateForeshadowing = (pid, fid, data) => api.put(`/projects/${pid}/foreshadowing/${fid}`, data).then(r => r.data);

// ========== 时间线 ==========
export const listTimeline = (pid) => api.get(`/projects/${pid}/timeline`).then(r => r.data);

// ========== 对话 ==========
export const listChat = (pid) => api.get(`/projects/${pid}/chat`).then(r => r.data);
export const sendChat = (pid, message) => api.post(`/projects/${pid}/chat`, { message }, { timeout: 60000 }).then(r => r.data);

// ========== 元数据提取 ==========
export const extractMeta = (pid, ch) => api.post(`/projects/${pid}/chapters/${ch}/extract-meta`, {}, { timeout: 60000 }).then(r => r.data);

// ========== 设置 ==========
export const getSettings = () => api.get('/settings').then(r => r.data);
export const updateSettings = (data) => api.put('/settings', data).then(r => r.data);
export const listProviders = () => api.get('/settings/providers').then(r => r.data);
export const fetchModels = (base_url, api_key) => api.post('/settings/models', { base_url, api_key }, { timeout: 15000 }).then(r => r.data);

// ========== 导入 ==========
export const batchImportChapters = (pid, data) => api.post(`/projects/${pid}/import/batch`, data, { timeout: 120000 }).then(r => r.data);
export const importFile = (pid, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/projects/${pid}/import/file`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data);
};

// ========== 预处理 ==========
export const preprocessProject = (pid) => api.post(`/projects/${pid}/preprocess`, {}, { timeout: 180000 }).then(r => r.data);

// ========== 总纲 ==========
export const getOverallOutline = (pid) => api.get(`/projects/${pid}/outline/overall`).then(r => r.data);
export const generateOverallOutline = (pid, data) => api.post(`/projects/${pid}/outline/overall/generate`, data || {}, { timeout: 120000 }).then(r => r.data);
export const updateOverallOutline = (pid, data) => api.put(`/projects/${pid}/outline/overall`, data).then(r => r.data);

// ========== 分卷大纲 ==========
export const listVolumeOutlines = (pid) => api.get(`/projects/${pid}/outlines/volumes`).then(r => r.data);
export const getVolumeOutline = (pid, vid) => api.get(`/projects/${pid}/outlines/volumes/${vid}`).then(r => r.data);
export const createVolumeOutline = (pid, data) => api.post(`/projects/${pid}/outlines/volumes`, data).then(r => r.data);
export const updateVolumeOutline = (pid, vid, data) => api.put(`/projects/${pid}/outlines/volumes/${vid}`, data).then(r => r.data);
export const deleteVolumeOutline = (pid, vid) => api.delete(`/projects/${pid}/outlines/volumes/${vid}`);
export const generateVolumeOutlines = (pid, data) => api.post(`/projects/${pid}/outlines/volumes/generate`, data || {}, { timeout: 120000 }).then(r => r.data);

// ========== 批量章纲生成 ==========
export const batchGenerateOutlines = (pid, vid, data) => api.post(`/projects/${pid}/outlines/chapters/batch-generate`, { volume_id: vid, ...(data || {}) }, { timeout: 120000 }).then(r => r.data);

export default api;
