import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { emptyGraph, type Graph } from '@/model/graph'
import type { Result } from '@/model/result'
import { parseYaml, toYaml } from '@/model/yaml'
import {
  copyShareLink,
  decodeShare,
  encodeShare,
  SHARE_COPIED_MESSAGE,
  SHARE_COPY_FAILED_MESSAGE,
  SHARE_DAMAGED_MESSAGE,
  SHARE_LONG,
  SHARE_LONG_MESSAGE,
  SHARE_PREFIX,
  shareUrl,
} from './shareLink'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const fixtures: Record<string, string> = import.meta.glob(
  '../model/__fixtures__/*.dag.yaml',
  { query: '?raw', import: 'default', eager: true },
)

function smoking(): Graph {
  const result = parseYaml(fixtures['../model/__fixtures__/smoking.dag.yaml']!)
  if (!result.ok) throw new Error('smoking.dag.yaml does not parse.')
  return result.value
}

/** A payload of arbitrary bytes, compressed the way `encodeShare` does it. */
async function payloadOf(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const out = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const compressed = new Uint8Array(await new Response(out).arrayBuffer())
  return btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function value(result: Result<Graph> | null): Graph {
  if (result === null) throw new Error('Expected a result.')
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join())
  return result.value
}

function errors(result: Result<Graph> | null): string[] {
  if (result === null) throw new Error('Expected a result.')
  if (result.ok) throw new Error('Expected decoding to fail.')
  return result.errors.map((e) => e.message)
}

describe('encodeShare and decodeShare', () => {
  it('round trips smoking.dag.yaml', async () => {
    const g = smoking()
    const decoded = await decodeShare(SHARE_PREFIX + (await encodeShare(g)))
    expect(toYaml(value(decoded))).toBe(toYaml(g))
  })

  it('round trips the empty graph', async () => {
    const g = emptyGraph()
    const decoded = await decodeShare(SHARE_PREFIX + (await encodeShare(g)))
    expect(toYaml(value(decoded))).toBe(toYaml(g))
  })

  it('round trips names with non-ASCII characters', async () => {
    const g = smoking()
    g.name = 'Rauchen & Geburtsgewicht: Größe, 体重'
    const decoded = await decodeShare(SHARE_PREFIX + (await encodeShare(g)))
    expect(value(decoded).name).toBe(g.name)
  })

  it('uses only A–Z a–z 0–9 - _ in the payload', async () => {
    const payload = await encodeShare(smoking())
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses the YAML text', async () => {
    const g = smoking()
    expect((await encodeShare(g)).length).toBeLessThan(toYaml(g).length)
  })
})

describe('shareUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the given base', async () => {
    const g = smoking()
    const url = await shareUrl(g, 'https://example.org/app/')
    expect(url).toBe(
      'https://example.org/app/' + SHARE_PREFIX + (await encodeShare(g)),
    )
  })

  it('defaults to the page address without query or fragment', async () => {
    vi.stubGlobal('location', {
      origin: 'https://graph.example',
      pathname: '/editor/',
      search: '?x=1',
      hash: '#old',
    })
    const url = await shareUrl(emptyGraph())
    expect(url.startsWith('https://graph.example/editor/#g=')).toBe(true)
  })
})

describe('decodeShare errors', () => {
  it('gives null for a hash without the prefix', async () => {
    expect(await decodeShare('')).toBeNull()
    expect(await decodeShare('#')).toBeNull()
    expect(await decodeShare('#section-2')).toBeNull()
    expect(await decodeShare('g=abc')).toBeNull()
  })

  it('reports a truncated payload as damaged', async () => {
    const payload = await encodeShare(smoking())
    for (const cut of [1, 10, Math.floor(payload.length / 2)]) {
      expect(
        errors(await decodeShare(SHARE_PREFIX + payload.slice(0, -cut))),
      ).toEqual([SHARE_DAMAGED_MESSAGE])
    }
  })

  it('reports an empty or non-base64url payload as damaged', async () => {
    for (const payload of ['', 'abc$', 'ab+c', 'ab/c', 'abcd=', 'a', 'a b']) {
      expect(errors(await decodeShare(SHARE_PREFIX + payload))).toEqual([
        SHARE_DAMAGED_MESSAGE,
      ])
    }
  })

  it('reports bytes that do not decompress as damaged', async () => {
    expect(errors(await decodeShare(SHARE_PREFIX + 'AQIDBAU'))).toEqual([
      SHARE_DAMAGED_MESSAGE,
    ])
  })

  it('reports a payload with trailing junk as damaged', async () => {
    const payload = await encodeShare(smoking())
    expect(errors(await decodeShare(SHARE_PREFIX + payload + 'AAAA'))).toEqual([
      SHARE_DAMAGED_MESSAGE,
    ])
  })

  it('reports text that is not UTF-8 as damaged', async () => {
    const payload = await payloadOf(new Uint8Array([0x6e, 0xff, 0xfe, 0x0a]))
    expect(errors(await decodeShare(SHARE_PREFIX + payload))).toEqual([
      SHARE_DAMAGED_MESSAGE,
    ])
  })

  it("gives parseYaml's errors for a valid payload of invalid YAML", async () => {
    const yaml = 'schema: graphcreator/0.1\nnodes:\n  - name: A\n  - name: A\n'
    const payload = await payloadOf(new TextEncoder().encode(yaml))
    const expected = parseYaml(yaml)
    expect(expected.ok).toBe(false)
    expect(errors(await decodeShare(SHARE_PREFIX + payload))).toEqual(
      errors(expected),
    )
  })
})

describe('copyShareLink', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    vi.mocked(toast).mockClear()
    vi.mocked(toast.error).mockClear()
    writeText.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('location', { origin: 'http://localhost', pathname: '/' })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('copies the link and toasts', async () => {
    const g = smoking()
    await copyShareLink(g)
    expect(writeText).toHaveBeenCalledWith(await shareUrl(g))
    expect(toast).toHaveBeenCalledWith(SHARE_COPIED_MESSAGE, {
      description: undefined,
    })
  })

  it('warns about a long link', async () => {
    const g = smoking()
    // Random-ish descriptions do not compress well, so the link grows past SHARE_LONG.
    g.nodes = g.nodes.map((n, i) => ({
      ...n,
      description: Array.from({ length: 1500 }, (_, k) =>
        ((k * 7919 + i * 104729) % 65521).toString(36),
      ).join(' '),
    }))
    await copyShareLink(g)
    expect(writeText.mock.calls[0]![0].length).toBeGreaterThan(SHARE_LONG)
    expect(toast).toHaveBeenCalledWith(SHARE_COPIED_MESSAGE, {
      description: SHARE_LONG_MESSAGE,
    })
  })

  it('shows the error toast when the clipboard fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    await copyShareLink(smoking())
    expect(toast).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(SHARE_COPY_FAILED_MESSAGE)
  })
})
