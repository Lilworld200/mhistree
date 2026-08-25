"use client";

import React, { type ReactNode } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  if (!content) return null;

  const blocks = parseBlocks(content);

  return (
    <div className={`md-content ${className}`}>
      {blocks.map((block, idx) => (
        <React.Fragment key={idx}>{block}</React.Fragment>
      ))}
    </div>
  );
}

function parseBlocks(raw: string): ReactNode[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);

  const elements: ReactNode[] = [];

  paragraphs.forEach((pText, pIdx) => {
    const trimmed = pText.trim();
    if (!trimmed) return;

    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Unordered list (* item or - item)
    const isUl = lines.length > 0 && lines.every((l) => /^[*|-]\s+/.test(l));
    if (isUl) {
      elements.push(
        <ul key={`ul-${pIdx}`} className="md-ul">
          {lines.map((line, lIdx) => {
            const itemText = line.replace(/^[*|-]\s+/, "");
            return (
              <li key={`li-${lIdx}`} className="md-li">
                {parseInline(itemText)}
              </li>
            );
          })}
        </ul>,
      );
      return;
    }

    // Ordered list (1. item or 2. item)
    const isOl = lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l));
    if (isOl) {
      elements.push(
        <ol key={`ol-${pIdx}`} className="md-ol">
          {lines.map((line, lIdx) => {
            const itemText = line.replace(/^\d+\.\s+/, "");
            return (
              <li key={`li-${lIdx}`} className="md-li">
                {parseInline(itemText)}
              </li>
            );
          })}
        </ol>,
      );
      return;
    }

    // Blockquote (> text)
    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s*/gm, "");
      elements.push(
        <blockquote key={`bq-${pIdx}`} className="md-blockquote">
          {parseInline(quoteText)}
        </blockquote>,
      );
      return;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${pIdx}`} className="md-p">
        {parseInline(trimmed)}
      </p>,
    );
  });

  return elements;
}

function parseInline(text: string): ReactNode {
  // Matches **bold**, *italic*, `code`, and [text](url)
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold **text**
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="md-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic *text*
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={index} className="md-em">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Code `text`
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="md-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Link [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="md-a"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}
