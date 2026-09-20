export interface ApiErrorShape {
  message: string
  fields: Record<string, string>
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return cur
}

export function extractError(err: unknown): ApiErrorShape {
  const data = (err as { data?: unknown })?.data
  const topMessage =
    typeof dig(data, ['message']) === 'string'
      ? String(dig(data, ['message']))
      : typeof dig(data, ['error']) === 'string'
        ? String(dig(data, ['error']))
        : 'Request failed'
  const fieldsValue = dig(data, ['data', 'fields']) ?? dig(data, ['fields'])
  const fields: Record<string, string> = {}
  if (fieldsValue && typeof fieldsValue === 'object' && !Array.isArray(fieldsValue)) {
    for (const [k, v] of Object.entries(fieldsValue as Record<string, unknown>)) {
      if (typeof v === 'string') fields[k] = v
    }
  }
  return { message: topMessage, fields }
}