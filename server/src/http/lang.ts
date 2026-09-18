interface HasHeader {
  req: { header: (key: string) => string | undefined }
}

/**
 * The learning-language label arrives in `x-target-lang`, percent-encoded
 * because HTTP header values are ASCII/ISO-8859-1 only.
 */
export function targetLangLabel(c: HasHeader, fallback = '英语'): string {
  const raw = c.req.header('x-target-lang')
  if (!raw) return fallback
  try {
    return decodeURIComponent(raw).trim() || fallback
  } catch {
    return fallback
  }
}
