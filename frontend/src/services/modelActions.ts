import type { Model } from '../api/types'
import { serializeFlags } from '../utils/flags'
import type { EnvVar, FlagPair } from '../utils/flags'

export interface TestResultInput {
  success: boolean
  content?: string
  error?: string
  status_code?: number
  model?: string
  finish_reason?: string
  latency_ms?: number
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function formatTestResult(
  result: TestResultInput,
  modelId: string,
  elapsedMs: number,
): { ok: boolean; text: string } {
  if (result.success) {
    const usage = result.usage
      ? ` · ${result.usage.prompt_tokens ?? '?'}→${result.usage.completion_tokens ?? '?'} tok`
      : ''
    const finish = result.finish_reason ? ` · finish=${result.finish_reason}` : ''
    const header = `${result.model || modelId} · ${elapsedMs}ms${usage}${finish}`
    return { ok: true, text: `${header}\n\n${result.content || '(empty response)'}` }
  } else {
    return { ok: false, text: `HTTP ${result.status_code ?? '?'} — ${result.error || 'unknown error'}` }
  }
}

export interface ModelPayloadFields {
  modelId: string
  name: string
  image: string
  modelPath: string
  contextLength: string
  maxOutputLength: string
  port: string
  containerName: string
  containerAlias: string
  modelAlias: string
  gracePeriod: string
  gpu: string
  envVars: EnvVar[]
  commandFlags: FlagPair[]
}

export function buildModelPayload(fields: ModelPayloadFields): Partial<Model> {
  const envObj: Record<string, string> = {}
  fields.envVars.forEach((ev) => {
    if (ev.key.trim()) envObj[ev.key.trim()] = ev.value
  })
  return {
    model_id: fields.modelId,
    name: fields.name,
    image: fields.image,
    model_path: fields.modelPath,
    context_length: fields.contextLength ? parseInt(fields.contextLength) : undefined,
    max_output_length: fields.maxOutputLength ? parseInt(fields.maxOutputLength) : undefined,
    port: fields.port ? parseInt(fields.port) : 30000,
    container_name: fields.containerName.trim() || `sgfleet-${fields.modelId}`,
    container_alias: fields.containerAlias.trim() || `sgfleet-${fields.modelId}`,
    model_alias: fields.modelAlias,
    grace_period: fields.gracePeriod ? parseInt(fields.gracePeriod) : 10,
    gpu: fields.gpu === 'auto' ? null : fields.gpu,
    environment: envObj,
    command_flags: serializeFlags(fields.commandFlags),
  }
}
