import { api } from '../api/client'
import type { SetupStatus, SetupResult } from '../api/types'

export async function getSetupStatus(): Promise<SetupStatus> {
  return api.getSetupStatus()
}

export async function completeSetup(data: { admin_name: string; base_url: string; hf_token?: string }): Promise<SetupResult> {
  return api.completeSetup(data)
}
