/**
 * Offers `text` to the user as a file download named `filename` (spec 5.4: Save and dagitty
 * export). Everything happens in the browser; nothing is sent to a server.
 */
export function downloadText(
  filename: string,
  text: string,
  mime: string,
): void {
  const blob = new Blob([text], { type: mime })
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
