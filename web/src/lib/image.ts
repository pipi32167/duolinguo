/**
 * Client-side image preparation.
 *
 * Phone cameras produce 4–12 MB files; uploading those raw costs tokens and
 * time. We downscale to a sane long edge and re-encode as JPEG before the
 * vision model ever sees it, and keep the original blob for the local preview.
 */

const MAX_EDGE = 1600
const QUALITY = 0.82

export interface PreparedImage {
  blob: Blob
  dataUrl: string
  width: number
  height: number
  originalBytes: number
  bytes: number
}

export async function prepareImage(file: File | Blob): Promise<PreparedImage> {
  const originalBytes = file.size
  const bitmap = await loadBitmap(file)
  const { width, height } = fit(bitmap.width, bitmap.height, MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图像处理')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  if ('close' in bitmap) bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))),
      'image/jpeg',
      QUALITY,
    )
  })

  const dataUrl = await blobToDataUrl(blob)
  return { blob, dataUrl, width, height, originalBytes, bytes: blob.size }
}

function fit(w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('无法读取这张图片'))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
