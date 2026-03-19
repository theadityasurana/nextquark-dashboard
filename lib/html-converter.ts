/**
 * Converts HTML to Markdown format for cross-platform compatibility
 * Works perfectly with React Native markdown renderers
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ""

  let markdown = html
    // Convert headings
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n")
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n")
    // Convert paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    // Convert line breaks
    .replace(/<br\s*\/?>/gi, "  \n")
    // Convert bold
    .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, "**$2**")
    // Convert italic
    .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, "*$2*")
    // Convert links
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // Convert unordered lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?ul[^>]*>/gi, "\n")
    // Convert ordered lists
    .replace(/<ol[^>]*>/gi, "\n")
    .replace(/<\/ol>/gi, "\n")
    // Convert code blocks
    .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, "```\n$1\n```\n\n")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    // Convert blockquotes
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
      return content.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n\n'
    })
    // Convert horizontal rules
    .replace(/<hr\s*\/?>/gi, "\n---\n\n")
    // Remove divs but keep content
    .replace(/<\/?div[^>]*>/gi, "\n")
    // Remove spans but keep content
    .replace(/<\/?span[^>]*>/gi, "")
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    // Clean up excessive whitespace
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()

  return markdown
}

/**
 * Converts HTML to plain readable text by stripping all tags, styles, scripts,
 * and decoding entities. Used for extracting OTPs from HTML emails.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ""

  return html
    // Remove style and script blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Block-level elements get newlines
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    // Strip all remaining tags
    .replace(/<[^>]*>/g, "")
    // Decode HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
}
