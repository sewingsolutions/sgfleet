export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function normalizeImportJson(text: string): string {
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) {
    return JSON.stringify({ models: parsed })
  }
  if (parsed && typeof parsed === 'object' && 'models' in parsed) {
    return text
  }
  return JSON.stringify({ models: [parsed] })
}
