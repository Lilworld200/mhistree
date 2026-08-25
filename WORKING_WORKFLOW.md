# Mhistree — Working Workflows & System Guidelines

This document tracks all reviewed, verified, and working code workflows in the Mhistree codebase. It serves as an immutable reference for developers and AI coding agents.

---

## 🚨 AGENT INSTRUCTIONS & PRESERVATION RULES

1. **Post-Fix Workflow Checklist**:
   - Whenever an AI Agent completes a bug fix, refactor, or feature implementation, it MUST ask the user if the fix works as expected.
   - If the user approves and confirms adding it to `WORKING_WORKFLOW.md`, the agent MUST document the verified workflow and its key components in this file.

2. **Non-Breaking Preservation Guarantee**:
   - All workflows documented in `WORKING_WORKFLOW.md` are **CRITICAL VERIFIED SYSTEM WORKFLOWS**.
   - AI Agents MUST NOT break, alter, or regress any documented workflow during future edits.
   - Refactoring underlying implementation details is allowed only if the functional behavior, user experience, and defined API/UI contracts remain 100% intact and verified.

---

## 📋 VERIFIED WORKFLOWS

### 1. Patient AI Conversational Persona & UI Markdown Rendering

- **Status**: Verified & Active
- **Description**: Defines the core AI behavior, medical probing strategy, disease-aware context utilization, and clean UI Markdown rendering for patient chat.

#### Key Components & Implementations:

- **System Pre-Prompt (`lib/ai/prompts/patient.ts`)**:
  - **Persona**: Mhistree AI acts as a professional, highly knowledgeable medical practitioner speaking in a warm, casual doctor-friend tone. Uses realistic human speech nuances ("Haha", "Oof", "Omor, I hear you!", "Good call", "Definitely grab that refill first").
  - **Health Probing**: Keeps the chat flowing naturally while subtly probing for daily activity impacts, symptoms, triggers, or habits without making it feel like a clinical examination.
  - **Disease Awareness**: Uses the patient's longitudinal record (e.g. chronic conditions like ulcer, asthma, diabetes) to steer advice contextually (e.g. guiding an ulcer patient away from acidic foods like oranges when asked).
  - **Output Structure**: Enforces short digestible paragraphs (1-3 lines), bold highlights (`**text**`), bullet point lists (`* item`) for actionable tips, and an open-ended question at the end of every message.
  - **Memory Persistence**: Maintains `🧠 Memory noted: [fact]` tag at the end of responses when new health details are detected.

- **UI Markdown Renderer (`components/ui/markdown-renderer.tsx`)**:
  - High-performance native React Markdown parser handling:
    - Paragraph blocks & double line breaks (`\n\n`)
    - Bold text (`**text**`) and Italic text (`*text*`)
    - Unordered lists (`* item`, `- item`) and Numbered lists (`1. item`)
    - Blockquotes (`> text`) and Inline code (`\`code\``)
    - External links (`[title](url)`)

- **Typewriter & Bubble Integration (`components/ui/typewriter.tsx` & `features/chat/components/message-bubble.tsx`)**:
  - `Typewriter` feeds sliced text into `MarkdownRenderer` so streaming text renders markdown live character-by-character.
  - Removed outer block `<p>` wrappers from `MessageBubble` to maintain valid React DOM hierarchy.

- **Design System Styles (`app/globals.css`)**:
  - Styles `.md-content`, `.md-p`, `.md-ul`, `.md-ol`, `.md-li`, `.md-strong`, `.md-em`, `.md-blockquote`, `.md-code`, `.md-a` to guarantee crisp typography, contrast, and proper bullet alignment in light and dark mode.
