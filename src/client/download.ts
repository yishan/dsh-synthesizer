/** Hand a generated file to the browser's download flow. */
export function downloadFile(data: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

/** A project name with the characters file systems reject replaced. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project'
}
