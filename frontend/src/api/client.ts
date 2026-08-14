import type { User, Stats, UserSummary, SettingsDefaults, SglModel, ModelConfig, GeneratedConfig, FleetStats, AuditEntry, RequestLogEntry, LogEntry, ModelHealth, Model, DashboardStats, GPUInfo, HFModel, HFSearchResult, DiskUsage, LocalModel, DownloadJob, DockerImagesResponse, ModelVersion, FieldHistoryEntry, SetupStatus, SetupResult, UserSession, UserProfile, UserModelsResponse, UserStats, UserRequestsResponse, UserQuota, UserConfigResponse } from './types'

const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const res = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.status === 401) {
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

const userApiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (res.status === 401) {
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || err.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Users
  getUsers: () => apiFetch<User[]>('/api/users'),
  createUser: (data: { name: string; rate_limit?: number; max_concurrent?: number }) =>
    apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  getUser: (id: number) => apiFetch<User>(`/api/users/${id}`),
  updateUser: (id: number, data: Record<string, unknown>) =>
    apiFetch<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rotateKey: (id: number) =>
    apiFetch<{ id: number; name: string; api_key: string }>(`/api/users/${id}/rotate`, { method: 'POST' }),
  deleteUser: (id: number) =>
    apiFetch<{ id: number; name: string; deleted: true }>(`/api/users/${id}`, { method: 'DELETE' }),
  bulkUpdateUsers: (data: { user_ids: number[]; is_active: boolean }) =>
    apiFetch<{ id: number; name: string; is_active: boolean }[]>('/api/users/bulk', { method: 'PATCH', body: JSON.stringify(data) }),

  // Stats
  getUserStats: (userId: number, range: string = '24h') =>
    apiFetch<Stats>(`/api/users/${userId}/stats?range=${range}`),
  getUserSummary: (userId: number) =>
    apiFetch<UserSummary>(`/api/users/${userId}/summary`),
  getFleetStats: (range: string = '24h') =>
    apiFetch<FleetStats>(`/api/stats?range=${range}`),
  getDashboardStats: () => apiFetch<DashboardStats>('/api/dashboard'),

  // Settings
  getSettingsDefaults: () => apiFetch<SettingsDefaults>('/api/settings/defaults'),
  updateSettingsDefaults: (data: Partial<SettingsDefaults>) =>
    apiFetch<SettingsDefaults>('/api/settings/defaults', { method: 'PATCH', body: JSON.stringify(data) }),
  getBaseUrl: () => apiFetch<{ base_url: string }>('/api/settings/base-url'),
  setBaseUrl: (url: string) =>
    apiFetch<{ saved: boolean }>('/api/settings/base-url', { method: 'POST', body: JSON.stringify({ url }) }),

  // Auth
  // NOTE: we let fetch follow the 302 so `res.url` reflects the redirect target
  // (with `redirect: 'manual'` the response is opaqueredirect and `res.url` is '').
  // The Set-Cookie header from the 302 is still applied by the browser.
  login: (key: string) =>
    fetch('/login', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `key=${encodeURIComponent(key)}`,
    }),
  logout: () => fetch('/logout', { credentials: 'same-origin' }),
  checkAuth: () => apiFetch<User[]>('/api/users'),
  checkSession: () => {
    return fetch('/api/session', {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json()) as Promise<UserSession>
  },

  // Models & config
  getModelConfig: (modelId?: string) =>
    modelId
      ? apiFetch<ModelConfig>(`/api/model/config?model_id=${modelId}`)
      : apiFetch<ModelConfig>('/api/model/config'),
  getModels: () => apiFetch<SglModel[]>('/api/models'),
  generateConfig: (userId: number, rotate: boolean = false) =>
    apiFetch<GeneratedConfig>(`/api/users/${userId}/config`, { method: 'POST', body: JSON.stringify({ user_id: userId, rotate }) }),

  // Model CRUD
  listModels: () => apiFetch<Model[]>('/api/models'),
  getModel: (modelId: string) => apiFetch<Model>(`/api/models/${modelId}`),
  createModel: (model: Partial<Model>) => apiFetch<{ model: Model; pending_restart: boolean }>(
    '/api/models',
    { method: 'POST', body: JSON.stringify(model) },
  ),
  updateModel: (modelId: string, model: Partial<Model>) => apiFetch<{ model: Model; pending_restart: boolean }>(
    `/api/models/${modelId}`,
    { method: 'PUT', body: JSON.stringify(model) },
  ),
  deleteModel: (modelId: string) => apiFetch<{ deleted: string }>(
    `/api/models/${modelId}`,
    { method: 'DELETE' },
  ),
  startModel: (modelId: string) => apiFetch<{ started: string }>(
    `/api/models/${modelId}/start`,
    { method: 'POST' },
  ),
  stopModel: (modelId: string) => apiFetch<{ stopped: string }>(
    `/api/models/${modelId}/stop`,
    { method: 'POST' },
  ),
  toggleModel: (modelId: string) => apiFetch<{ model_id: string; active: boolean }>(
    `/api/models/${modelId}/toggle`,
    { method: 'POST' },
  ),
  getModelUsers: (modelId: string) => apiFetch<{ users: User[] }>(`/api/models/${modelId}/users`),
  setModelUsers: (modelId: string, userIds: number[]) => apiFetch<{ updated: boolean }>(
    `/api/models/${modelId}/users`,
    { method: 'PUT', body: JSON.stringify({ user_ids: userIds }) },
  ),
  exportModels: () => apiFetch<{ json: string }>(
    '/api/models/export',
    { method: 'POST' },
  ),
  importModels: (jsonContent: string) => apiFetch<{ imported: number }>(
    '/api/models/import',
    { method: 'POST', body: JSON.stringify({ json: jsonContent }) },
  ),
  getUserModelAccess: (userId: number) => apiFetch<Model[]>(`/api/users/${userId}/model-access`),
  setUserDefaultModel: (userId: number, modelId: string | null) =>
    apiFetch<{ updated: boolean }>(
      `/api/users/${userId}/default-model`,
      { method: 'PUT', body: JSON.stringify({ model_id: modelId }) },
    ),
  getUserDefaultModel: (userId: number) =>
    apiFetch<Model | null>(`/api/users/${userId}/default-model`),

  // Model version history
  getModelVersions: (modelId: string) => apiFetch<ModelVersion[]>(`/api/models/${modelId}/versions`),
  getFieldHistory: (modelId: string, field: string) =>
    apiFetch<FieldHistoryEntry[]>(`/api/models/${modelId}/field-history/${encodeURIComponent(field)}`),
  revertField: (modelId: string, field: string, value: unknown) =>
    apiFetch<{ model: Model; pending_restart: boolean }>(
      `/api/models/${modelId}/revert-field`,
      { method: 'POST', body: JSON.stringify({ field, value }) },
    ),
  clearPendingRestart: (modelId: string) =>
    apiFetch<{ cleared: boolean }>(`/api/models/${modelId}/clear-pending-restart`, { method: 'POST' }),

  // Audit & requests
  getAuditLog: (limit: number = 200) => apiFetch<AuditEntry[]>('/api/audit_log?limit=' + limit),
  getUserRequests: (userId: number, limit: number = 100) =>
    apiFetch<RequestLogEntry[]>(`/api/users/${userId}/requests?limit=${limit}`),

  // Version
  getGitLog: () => apiFetch<{ head: string; commits: { sha: string; msg: string }[] }>('/api/git_log'),

  // Settings helpers
  fetchGet: (path: string) => apiFetch<Record<string, unknown>>(path),
  fetchPost: (path: string, body: Record<string, unknown>) => apiFetch<Record<string, unknown>>(path, { method: 'POST', body: JSON.stringify(body) }),
  fetchDelete: (path: string) => apiFetch<Record<string, unknown>>(path, { method: 'DELETE' }),


  // Logs
  getLogs: (params: { limit?: number; level?: string; user?: string; path?: string; keyword?: string }) => {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.level) qs.set('level', params.level)
    if (params.user) qs.set('user', params.user)
    if (params.path) qs.set('path', params.path)
    if (params.keyword) qs.set('keyword', params.keyword)
    return apiFetch<LogEntry[]>(`/api/logs?${qs.toString()}`)
  },
  getLogLevel: () => apiFetch<{ level: string }>('/api/logs/config'),
  setLogLevel: (level: string) =>
    apiFetch<{ level: string }>('/api/logs/config', { method: 'PATCH', body: JSON.stringify({ level }) }),

  // Model health
  getModelHealth: (modelId?: string) =>
    modelId
      ? apiFetch<ModelHealth>(`/api/model/health?model_id=${modelId}`)
      : apiFetch<ModelHealth>('/api/model/health'),
  testModel: (modelId?: string) =>
    apiFetch<{
      success: boolean
      content?: string
      raw_content?: string
      reasoning_content?: string
      error?: string
      status_code?: number
      model?: string
      finish_reason?: string
      latency_ms?: number
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }>(
      '/api/model/test',
      { method: 'POST', body: JSON.stringify({ model_id: modelId || null }) },
    ),

  // Model Download
  getGPUs: () => apiFetch<{ gpus: GPUInfo[]; total_vram_gb: number }>('/api/download/gpus'),
  searchHFModels: (q: string, maxVramGb?: number, limit?: number) => {
    const params = new URLSearchParams({ q })
    if (maxVramGb) params.set('max_vram_gb', String(maxVramGb))
    if (limit) params.set('limit', String(limit))
    return apiFetch<HFSearchResult>(`/api/download/search?${params.toString()}`)
  },
  getHFToken: () => apiFetch<{ has_token: boolean; masked_token: string }>('/api/download/hf-token'),
  setHFToken: (token: string) =>
    apiFetch<{ saved: boolean }>('/api/download/hf-token', { method: 'POST', body: JSON.stringify({ token }) }),
  getDiskSpace: () => apiFetch<DiskUsage>('/api/download/disk-space'),
  listLocalModels: () => apiFetch<LocalModel[]>('/api/download/local-models'),
  checkModelPath: (path: string) => apiFetch<{ exists: boolean }>(`/api/download/path-exists?path=${encodeURIComponent(path)}`),
  cleanupModelPath: (path: string) =>
    apiFetch<{ cleaned: boolean }>('/api/download/cleanup', { method: 'POST', body: JSON.stringify({ path }) }),
  createModelConfig: (data: { hf_model: HFModel; target_dir: string; gpu_indices: number[] }) =>
    apiFetch<{ model_id: string; config: Record<string, unknown> }>('/api/download/model-config', { method: 'POST', body: JSON.stringify(data) }),
  getDownloadStatus: () =>
    apiFetch<{ downloads: DownloadJob[] }>('/api/download/status'),
  getDockerImages: () => apiFetch<DockerImagesResponse>('/api/download/docker-images'),

  // Setup
  getSetupStatus: () => apiFetch<SetupStatus>('/api/system/setup-status'),
  completeSetup: (data: { admin_name: string; base_url: string; hf_token?: string }) =>
    apiFetch<SetupResult>('/api/system/setup', { method: 'POST', body: JSON.stringify(data) }),

  // User dashboard API
  user: {
    getMe: () => userApiFetch<UserProfile>('/user/me'),
    getModels: () => userApiFetch<UserModelsResponse>('/user/models'),
    getStats: (range: string = 'today') => userApiFetch<UserStats>(`/user/stats?range=${range}`),
    getRequests: (limit: number = 50, offset: number = 0) =>
      userApiFetch<UserRequestsResponse>(`/user/requests?limit=${limit}&offset=${offset}`),
    getQuota: () => userApiFetch<UserQuota>('/user/quota'),
    generateConfig: (client: string = 'opencode') =>
      userApiFetch<UserConfigResponse>('/user/config', { method: 'POST', body: JSON.stringify({ client }) }),
  },
}
