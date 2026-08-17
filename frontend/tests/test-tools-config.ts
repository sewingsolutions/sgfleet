import { tools, getToolById, getDownloadFilename } from '../src/config/tools'

describe('tools config', () => {
  test('exports 6 tools', () => {
    expect(tools.length).toBe(6)
  })

  test('includes expected tool IDs', () => {
    const ids = tools.map(t => t.id)
    expect(ids).toContain('opencode')
    expect(ids).toContain('continue')
    expect(ids).toContain('cline')
    expect(ids).toContain('interpreter')
    expect(ids).toContain('cursor')
    expect(ids).toContain('claude_code')
  })

  test('code tools have language', () => {
    const codeTools = tools.filter(t => t.configType === 'code')
    for (const t of codeTools) {
      expect(t.language).toBeDefined()
    }
  })

  test('checklist tools do not have language', () => {
    const checklists = tools.filter(t => t.configType === 'checklist')
    for (const t of checklists) {
      expect(t.language).toBeUndefined()
    }
  })

  test('all tools have description', () => {
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0)
    }
  })
})

describe('getToolById', () => {
  test('returns tool by id', () => {
    const tool = getToolById('cline')
    expect(tool?.id).toBe('cline')
    expect(tool?.name).toBe('Cline / Roo Code')
  })

  test('returns undefined for unknown id', () => {
    expect(getToolById('nonexistent')).toBeUndefined()
  })
})

describe('getDownloadFilename', () => {
  test('returns correct filename for each tool', () => {
    expect(getDownloadFilename('opencode')).toBe('opencode.json')
    expect(getDownloadFilename('continue')).toBe('continue.json')
    expect(getDownloadFilename('cline')).toBe('vscode-cline.json')
    expect(getDownloadFilename('interpreter')).toBe('sgfleet.yaml')
    expect(getDownloadFilename('cursor')).toBe('(checklist - no download)')
    expect(getDownloadFilename('claude_code')).toBe('claude-code.sh')
  })

  test('returns fallback for unknown tool', () => {
    expect(getDownloadFilename('unknown')).toBe('unknown.txt')
  })
})
