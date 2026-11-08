/**
 * Share links (spec 4.12): the whole graph travels in the URL fragment as
 * base64url(deflate-raw(UTF-8 `toYaml(graph)`)), so no server is involved. Browsers never send
 * the part after `#`, and the app has no backend (spec section 1).
 */
import { toast } from 'sonner'
import type { Graph } from '@/model/graph'
import type { Result } from '@/model/result'
import { parseYaml, toYaml } from '@/model/yaml'

export const SHARE_PREFIX = '#g='

/** Characters; a longer link gets a warning in the Share toast (spec 5.4). */
export const SHARE_LONG = 8000

/** The error of a payload that is not valid base64url or does not decompress. */
export const SHARE_DAMAGED_MESSAGE = 'This share link is damaged or incomplete.'

export const SHARE_COPIED_MESSAGE =
  'Link copied. The graph is stored in the link itself, not on a server.'
export const SHARE_LONG_MESSAGE =
  'The link is long and may not work in every app. Save as GraphCreator to share a file instead.'
export const SHARE_COPY_FAILED_MESSAGE =
  'Could not copy the link to the clipboard.'

const BASE64URL = /^[A-Za-z0-9_-]*$/

/** Runs `bytes` through a compression or decompression stream. Rejects when the stream fails. */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The bytes of an unpadded base64url string, or null when it is not one. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The share payload of `graph`: base64url(deflate-raw(UTF-8 `toYaml(graph)`)), no padding. */
export async function encodeShare(graph: Graph): Promise<string> {
  const text = new TextEncoder().encode(toYaml(graph))
  return toBase64Url(await pipe(text, new CompressionStream('deflate-raw')))
}

/** `base + SHARE_PREFIX + payload`; `base` defaults to the page address without query or fragment. */
export async function shareUrl(graph: Graph, base?: string): Promise<string> {
  const start = base ?? location.origin + location.pathname
  return start + SHARE_PREFIX + (await encodeShare(graph))
}

/**
 * Reads the graph out of a location hash. Null when `hash` does not start with `SHARE_PREFIX`.
 * A payload that is not base64url, does not decompress or is not UTF-8 gives the error
 * `SHARE_DAMAGED_MESSAGE`; one that decompresses but does not parse gives `parseYaml`'s errors.
 */
export async function decodeShare(hash: string): Promise<Result<Graph> | null> {
  if (!hash.startsWith(SHARE_PREFIX)) return null
  const damaged: Result<Graph> = {
    ok: false,
    errors: [{ message: SHARE_DAMAGED_MESSAGE }],
  }
  const bytes = fromBase64Url(hash.slice(SHARE_PREFIX.length))
  if (bytes === null || bytes.length === 0) return damaged
  let text: string
  try {
    const raw = await pipe(bytes, new DecompressionStream('deflate-raw'))
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    return damaged
  }
  return parseYaml(text)
}

/**
 * The top bar's Share (spec 5.4): copies `shareUrl(graph)` to the clipboard and toasts, with a
 * warning when the link is longer than `SHARE_LONG`. Any failure shows the clipboard error toast.
 */
export async function copyShareLink(graph: Graph): Promise<void> {
  try {
    const url = await shareUrl(graph)
    await navigator.clipboard.writeText(url)
    toast(SHARE_COPIED_MESSAGE, {
      description: url.length > SHARE_LONG ? SHARE_LONG_MESSAGE : undefined,
    })
  } catch {
    toast.error(SHARE_COPY_FAILED_MESSAGE)
  }
}
