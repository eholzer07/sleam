import type { MentionCandidate, OutgoingMention } from '../../../shared/api'
import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Converts Teams message HTML into safe markup for display. */
export function sanitizeMessage(html: string): string {
  const normalized = html
    .replace(/<emoji\b[^>]*\balt="([^"]*)"[^>]*>(?:<\/emoji>)?/gi, '$1')
    .replace(/<at\b[^>]*>(.*?)<\/at>/gi, '<span class="mention">@$1</span>')
  const template = document.createElement('template')
  template.innerHTML = DOMPurify.sanitize(normalized, {
    FORBID_TAGS: ['style', 'attachment', 'form', 'input', 'button'],
    FORBID_ATTR: ['style']
  })
  // Inline images hosted by Graph need an auth header we can't attach to <img>.
  for (const img of template.content.querySelectorAll('img')) {
    if (!/graph\.microsoft\.com/i.test(img.getAttribute('src') ?? '')) continue
    const placeholder = document.createElement('span')
    placeholder.className = 'image-placeholder'
    placeholder.textContent = '🖼 Image'
    img.replaceWith(placeholder)
  }
  return template.innerHTML
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/

function formatInline(text: string): string {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, i) => {
      if (i % 2) return `<code>${escapeHtml(part.slice(1, -1))}</code>`
      return part
        .split(URL_PATTERN)
        .map((piece, j) => {
          const safe = escapeHtml(piece)
          if (j % 2) return `<a href="${safe}">${safe}</a>`
          return safe
            .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>')
            .replace(/~([^~\n]+)~/g, '<s>$1</s>')
        })
        .join('')
    })
    .join('')
    .replace(/\n/g, '<br>')
}

/** Converts Slack-style markup (*bold*, _italic_, ~strike~, `code`, ```blocks```) to HTML. */
export function markupToHtml(text: string): string {
  return text
    .trim()
    .split(/```([\s\S]*?)```/)
    .map((part, i) => (i % 2 ? `<pre><code>${escapeHtml(part.replace(/^\n|\n$/g, ''))}</code></pre>` : formatInline(part)))
    .join('')
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Like markupToHtml, but turns "@Name" for each picked mention still in the text into a Teams mention
 * (<at id="n">Name</at>), returning the matching mention list for Graph. Edited or deleted names aren't sent.
 */
export function markupWithMentions(text: string, picked: MentionCandidate[]): { html: string; mentions: OutgoingMention[] } {
  const byText = new Map(picked.map((c) => [`@${c.name}`, c]))
  if (byText.size === 0) return { html: markupToHtml(text), mentions: [] }
  // Longest first, so "@Sam Alvarez" wins over a shorter overlapping name.
  const pattern = new RegExp([...byText.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'g')
  const mentions: OutgoingMention[] = []
  // Control characters survive markupToHtml untouched and can't be typed, so they make safe placeholders.
  const marked = text.replace(pattern, (match) => {
    mentions.push({ id: mentions.length, target: byText.get(match)! })
    return `\u0001${mentions.length - 1}\u0002`
  })
  const html = markupToHtml(marked).replace(
    /\u0001(\d+)\u0002/g,
    (_, id) => `<at id="${id}">${escapeHtml(mentions[Number(id)].target.name)}</at>`
  )
  return { html, mentions }
}
