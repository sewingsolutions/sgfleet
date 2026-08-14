export function copyToClipboard(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.setSelectionRange(0, text.length)
  document.execCommand('copy')
  document.body.removeChild(ta)
}
