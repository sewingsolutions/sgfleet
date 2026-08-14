export type EnvVar = { key: string; value: string }
export type FlagPair = { key: string; value: string }

const emptyFlags = (): FlagPair[] => [{ key: '', value: '' }]

export const parseFlags = (flags: string[] | undefined | null): FlagPair[] => {
  if (!flags || flags.length === 0) return emptyFlags()
  const pairs: FlagPair[] = []
  let i = 0
  while (i < flags.length) {
    const token = flags[i]
    const next = i + 1 < flags.length ? flags[i + 1] : undefined
    if (token.startsWith('--')) {
      if (next !== undefined && !next.startsWith('--')) {
        pairs.push({ key: token, value: next })
        i += 2
      } else {
        pairs.push({ key: token, value: '' })
        i += 1
      }
    } else {
      pairs.push({ key: token, value: '' })
      i += 1
    }
  }
  return pairs.length > 0 ? pairs : emptyFlags()
}

export const serializeFlags = (pairs: FlagPair[]): string[] => {
  const out: string[] = []
  for (const p of pairs) {
    const k = p.key.trim()
    if (!k) continue
    out.push(k)
    const v = p.value.trim()
    if (v) out.push(v)
  }
  return out
}
