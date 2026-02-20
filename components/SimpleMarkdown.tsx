import React from "react";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function renderInline(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const href = safeUrl(url);
    if (!href) {
      return label;
    }
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  return html;
}

function codeBlock(language: string, codeLines: string[], key: string) {
  return (
    <pre key={key}>
      <code className={language ? `language-${language}` : undefined}>{codeLines.join("\n")}</code>
    </pre>
  );
}

export function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const currentLine = lines[i];

    if (!currentLine.trim()) {
      i += 1;
      continue;
    }

    const fenceMatch = currentLine.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] ?? "";
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      elements.push(codeBlock(language, codeLines, `code-${i}`));
      continue;
    }

    const headingMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const tag = `h${level}`;
      elements.push(
        React.createElement(tag, {
          key: `h-${i}`,
          dangerouslySetInnerHTML: { __html: renderInline(text) }
        })
      );
      i += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(currentLine)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i += 1;
      }
      elements.push(
        <ul key={`ul-${i}`}>
          {items.map((item, itemIndex) => (
            <li key={`li-${i}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(currentLine)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      elements.push(
        <ol key={`ol-${i}`}>
          {items.map((item, itemIndex) => (
            <li key={`oli-${i}-${itemIndex}`} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ol>
      );
      continue;
    }

    if (/^>\s?/.test(currentLine)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      elements.push(
        <blockquote
          key={`q-${i}`}
          dangerouslySetInnerHTML={{ __html: renderInline(quoteLines.join("\n")) }}
        />
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^```(\w+)?\s*$/) &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].match(/^[-*+]\s+/) &&
      !lines[i].match(/^\d+\.\s+/) &&
      !lines[i].match(/^>\s?/)
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }

    elements.push(
      <p key={`p-${i}`} dangerouslySetInnerHTML={{ __html: renderInline(paragraphLines.join(" ")) }} />
    );
  }

  return <>{elements}</>;
}
