import { api } from '../api/client'
import type {
  Model,
  ModelVersion,
  FieldHistoryEntry,
  ModelHealth,
  GPUInfo,
  HFModel,
  HFSearchResult,
  DiskUsage,
  LocalModel,
  DownloadJob,
  DockerImagesResponse,
  User,
} from '../api/types'

export async function getModels(): Promise<Model[]> {
  return api.listModels()
}

export async function getModel(modelId: string): Promise<Model> {
  return api.getModel(modelId)
}

export async function createModel(model: Partial<Model>): Promise<{ model: Model; pending_restart: boolean }> {
  return api.createModel(model)
}

export async function updateModel(modelId: string, model: Partial<Model>): Promise<{ model: Model; pending_restart: boolean }> {
  return api.updateModel(modelId, model)
}

export async function deleteModel(modelId: string): Promise<{ deleted: string }> {
  return api.deleteModel(modelId)
}

export async function startModel(modelId: string): Promise<{ started: string }> {
  return api.startModel(modelId)
}

export async function stopModel(modelId: string): Promise<{ stopped: string }> {
  return api.stopModel(modelId)
}

export async function toggleModel(modelId: string): Promise<{ model_id: string; active: boolean }> {
  return api.toggleModel(modelId)
}

export async function getModelHealth(modelId?: string): Promise<ModelHealth> {
  return api.getModelHealth(modelId)
}

export async function testModel(modelId?: string): Promise<{
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
}> {
  return api.testModel(modelId)
}

export async function getModelVersions(modelId: string): Promise<ModelVersion[]> {
  return api.getModelVersions(modelId)
}

export async function getFieldHistory(modelId: string, field: string): Promise<FieldHistoryEntry[]> {
  return api.getFieldHistory(modelId, field)
}

export async function revertField(modelId: string, field: string, value: unknown): Promise<{ model: Model; pending_restart: boolean }> {
  return api.revertField(modelId, field, value)
}

export async function clearPendingRestart(modelId: string): Promise<{ cleared: boolean }> {
  return api.clearPendingRestart(modelId)
}

export async function getModelUsers(modelId: string): Promise<{ users: User[] }> {
  return api.getModelUsers(modelId)
}

export async function setModelUsers(modelId: string, userIds: number[]): Promise<{ updated: boolean }> {
  return api.setModelUsers(modelId, userIds)
}

export async function exportModels(): Promise<{ json: string }> {
  return api.exportModels()
}

export async function importModels(jsonContent: string): Promise<{ imported: number }> {
  return api.importModels(jsonContent)
}

export async function getUserModelAccess(userId: number): Promise<Model[]> {
  return api.getUserModelAccess(userId)
}

export async function setUserDefaultModel(userId: number, modelId: string | null): Promise<{ updated: boolean }> {
  return api.setUserDefaultModel(userId, modelId)
}

export async function getUserDefaultModel(userId: number): Promise<Model | null> {
  return api.getUserDefaultModel(userId)
}

export async function getGPUs(): Promise<{ gpus: GPUInfo[]; total_vram_gb: number }> {
  return api.getGPUs()
}

export async function getDockerImages(): Promise<DockerImagesResponse> {
  return api.getDockerImages()
}

export async function searchHFModels(q: string, maxVramGb?: number, limit?: number): Promise<HFSearchResult> {
  return api.searchHFModels(q, maxVramGb, limit)
}

export async function getHFToken(): Promise<{ has_token: boolean; masked_token: string }> {
  return api.getHFToken()
}

export async function getDiskSpace(): Promise<DiskUsage> {
  return api.getDiskSpace()
}

export async function listLocalModels(): Promise<LocalModel[]> {
  return api.listLocalModels()
}

export async function checkModelPath(path: string): Promise<{ exists: boolean }> {
  return api.checkModelPath(path)
}

export async function cleanupModelPath(path: string): Promise<{ cleaned: boolean }> {
  return api.cleanupModelPath(path)
}

export async function createModelConfig(data: { hf_model: HFModel; target_dir: string; gpu_indices: number[] }): Promise<{ model_id: string; config: Record<string, unknown> }> {
  return api.createModelConfig(data)
}

export async function getDownloadStatus(): Promise<{ downloads: DownloadJob[] }> {
  return api.getDownloadStatus()
}
