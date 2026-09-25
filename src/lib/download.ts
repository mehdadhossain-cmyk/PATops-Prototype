// Saving generated files. Inside the hosted demo page (claude.ai) browsers block direct downloads,
// so we go through the page's `downloads` capability when it's available, and fall back to a
// normal browser download everywhere else.

interface DownloadsNs {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>
}
interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsNs | null>
}

export type SaveOutcome = 'saved' | 'declined' | 'failed'

/** True when running inside the hosted viewer, where printing and direct downloads are blocked. */
export const inHostedViewer = () => typeof window !== 'undefined' && !!(window as unknown as { claude?: ClaudeHost }).claude?.use

export async function saveFile(filename: string, data: string | Blob, mime = 'application/octet-stream'): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null)
    if (downloads) {
      try {
        await downloads.save({ filename, data })
        return 'saved'
      } catch (e) {
        return (e as { code?: string })?.code === 'declined' ? 'declined' : 'failed'
      }
    }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'saved'
}
