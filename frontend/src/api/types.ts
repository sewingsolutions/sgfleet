export interface User {
  id: number
  name: string
  is_active: boolean
  rate_limit: number
  max_concurrent: number
  request_cost: number
  daily_quota: number | null
  today_requests?: number
  total_requests?: number
  created_at: string
  api_key?: string
  email: string | null
  notes: string | null
}

export interface Stats {
  labels: string[]
  requests: number[]
  costs: number[]
  latency_p50: number[]
  latency_p95: number[]
  count_429: number[]
  prompt_tokens: number[]
  completion_tokens: number[]
  total_tokens: number[]
}

export interface FleetStats {
  labels: string[]
  total_requests: number
  avg_latency: number
  total_429: number
  total_prompt_tokens: number
  total_completion_tokens: number
  users: FleetUserStats[]
  latency_p50: number[]
  latency_p95: number[]
  count_429: number[]
}

export interface FleetUserStats {
  user: string
  p50: number
  p95: number
  c429: number
}

export interface UserSummary {
  total_requests: number
  total_cost: number
  today_requests: number
  daily_quota: number | null
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface SettingsDefaults {
  default_rate_limit: number
  default_max_concurrent: number
  default_request_cost: number
}

export interface SglModel {
  id: string
  name: string
}

export interface ModelConfig {
  model_path: string
  model_name: string
  context_length: number
  max_output_length: number
}

export interface GeneratedConfig {
  api_key: string
  rotated: boolean
  config: Record<string, unknown>
  config_json?: string
  checklist?: CursorChecklistItem[]
}

export interface AuditEntry {
  id: number
  timestamp: string
  action: string
  target_user_id: number | null
  detail: string
  ip_address: string
}

export interface RequestLogEntry {
  id: number
  timestamp: string
  user_id: number | null
  request_id: string
  method: string
  endpoint: string
  status: number
  latency_ms: number
  error_msg: string
}

export interface Webhook {
  id: number
  name: string
  url: string
  events: string[]
  is_active: boolean
  secret: string
  created_at: string
}

export interface Model {
  id: number
  model_id: string
  name: string
  image: string
  model_path: string
  context_length: number
  max_output_length: number
  port: number
  container_name: string
  container_alias: string
  model_alias: string
  active: boolean
  grace_period: number
  environment: Record<string, string>
  gpu: string | null
  command_flags: string[]
  created_at: string
  pending_restart?: boolean
  startup_error?: string | null
  startup_error_at?: string | null
  status?: 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
  health?: ModelHealth | null
  disk_bytes?: number | null
}

export interface ModelVersion {
  version: number
  snapshot: Record<string, unknown>
  created_at: string
}

export interface FieldHistoryEntry {
  version: number
  value: unknown
  created_at: string
}

export interface LogEntry {
  id: number
  timestamp: string
  level: string
  event: string | null
  method: string | null
  path: string | null
  status: number | null
  latency_ms: number | null
  user: string | null
  request_id: string | null
  ip: string | null
  error: string | null
  message: string | null
}

export interface ModelHealthContainer {
  name: string
  state: string
  started_at: string
  restart_count: number
  health_status: string
}

export interface ModelHealth {
  model_id: string
  status: 'healthy' | 'loading' | 'unhealthy' | 'unreachable'
  server_up: boolean
  model_loaded: boolean
  http_latency_ms: number
  container: ModelHealthContainer | null
  admin: {
    uptime_seconds: number
    memory_mb: number
  }
  error: string | null
  last_checked: string
}

export interface DashboardStats {
  total_models: number
  active_models: number
  total_users: number
  active_users: number
  requests_24h: number
  errors_24h: number
  median_latency_ms: number
  rate_limited_24h: number
}

export interface GPUInfo {
  index: number
  name: string
  vram_mb: number
  vram_gb: number
}

export interface HFModel {
  id: string
  author: string
  likes: number
  downloads: number
  vram_gb: number
  parameters: Record<string, number>
  total_params: number
  storage_bytes: number
  library: string
  tags: string[]
  gated: boolean | string
  last_modified: string
  config: Record<string, unknown>
  architectures: string[]
}

export interface HFSearchResult {
  models: HFModel[]
  hidden_by_vram: number
}

export interface DiskUsage {
  free_bytes: number
  free_gb: number
  total_gb: number
}

export interface LocalModel {
  name: string
  path: string
  container_path: string
  size_bytes: number
  size_gb: number
  file_count: number
}

export type SSEEventType = 'start' | 'log' | 'complete' | 'error' | 'model_created' | 'heartbeat'
export interface SSEEvent {
  type: SSEEventType
  line?: string
  message?: string
  model_id?: string
  target_dir?: string
  progress?: number
}

export interface DownloadJob {
  model_id: string
  target_dir: string
  status: 'downloading' | 'complete' | 'error'
  progress: number
  logs: string[]
  error: string | null
  started_at: number
  updated_at: number
}

export interface DownloadStatusResponse {
  downloads: DownloadJob[]
}

export type LogStreamEvent =
  | { type: 'line'; line: string }
  | { type: 'eof' }
  | { type: 'error'; message: string }
  | { type: 'startup_error'; message: string; at?: string }

export interface DockerImagesResponse {
  images: string[]
  error?: string
}

export interface SetupStatus {
  setup_complete: boolean
}

export interface SetupResult {
  setup_complete: boolean
  admin_name: string
  admin_api_key: string
}

export interface UserSession {
  role?: 'admin' | 'user'
  name?: string
  user_id?: number
  error?: string
}

export interface UserProfile {
  id: number
  name: string
  rate_limit: number
  max_concurrent: number
  daily_quota: number | null
  request_cost: number
  created_at: string
  email: string | null
  notes: string | null
}

export interface UserAuthorizedModel {
  model_id: string
  name: string
  active: boolean
  ready: boolean
  model_alias: string
}

export interface UserModelsResponse {
  models: UserAuthorizedModel[]
}

export interface UserStats {
  labels: string[]
  requests: number[]
  latency_p50: number[]
  latency_p95: number[]
  count_429: number[]
  prompt_tokens: number[]
  completion_tokens: number[]
  total_tokens: number[]
  today_requests: number
  in_memory_note: boolean
}

export interface UserRequestEntry {
  id: number
  timestamp: string
  user_id: number | null
  request_id: string
  method: string
  endpoint: string
  status: number
  latency_ms: number
  error_msg: string
  prompt_tokens: number
  completion_tokens: number
}

export interface UserRequestsResponse {
  requests: UserRequestEntry[]
  total: number
  limit: number
  offset: number
}

export interface UserQuota {
  daily_quota: number | null
  today_requests: number
  remaining: number | null
  usage_percent: number | null
  total_requests: number
  total_tokens: number
  total_prompt_tokens: number
  total_completion_tokens: number
}

export interface CursorChecklistItem {
  step: string
  value: string
}

export interface UserConfigResponse {
  api_key: string
  config: Record<string, unknown>
  config_json: string
  checklist?: CursorChecklistItem[]
  error?: string
}
