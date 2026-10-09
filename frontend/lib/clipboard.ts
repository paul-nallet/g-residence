export async function copyText(value: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<boolean> {
  try {
    if (!clipboard) return false
    await clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
