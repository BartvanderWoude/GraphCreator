/**
 * Offers `blob` to the user as a file download named `filename` (spec 4.11, 5.4: Save and
 * Export). Everything happens in the browser; nothing is sent to a server.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled, so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Offers `text` as a file download named `filename`, with the MIME type `mime`. */
export function downloadText(
  filename: string,
  text: string,
  mime: string,
): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}
