# Mhistree Technical Architecture & Development Recipe Book (`idea_todo.md`)

This document serves as the master blueprint and step-by-step recipe book for building Mhistree's production-ready healthcare AI application.

---

## 🟢 Section 1: Current Implementation State

The project has established a scalable, feature-first foundation:

1. **Feature-First Architecture (`features/`)**:
   - `features/shell`: Header, Patient & Clinician navigation, mobile drawer (`AppShell`).
   - `features/chat`: Chat store (`useChatStore`), message list, session grouping (`Today`, `Yesterday`, `Previous 7 days`), AI streaming API endpoint (`app/api/ai/chat/route.ts`).
   - `features/health`: Patient health timeline (`TimelineEventCard`), health metric cards, and vitals.
   - `features/documents`: Document list (`DocCard`), preview drawer, upload endpoint (`app/api/documents/route.ts`).
   - `features/sharing`: Patient consent sharing wizard (`ShareWizardModal`), active access leases, emergency OTP.
   - `features/clinician`: Clinician dashboard (`PatientHeader`), patient search, hypothesis confidence meter (`supbar`), and timeline feed.

2. **Design System & Aesthetics**:
   - **Soft-Float UI** system defined in `app/globals.css`.
   - High-contrast **Qwenthree Layered Dark Mode** (`#0E0E10` stage, `#191A1C` / `#1F2023` shells, `#28292C` cards, `#3C3D42` active tabs) matching modern music player aesthetics.
   - Circular avatars (`av`) and responsive layouts with custom 4px soft-float scrollbars.

---

## 📖 Section 2: Step-by-Step Production Recipe Book

---

### Step 1: Conversation Storage, Indexing & Synchronization

**Goal**: Persist chat sessions reliably across local client state and backend databases.

- **Client Persistence**:
  - Use Zustand `persist` middleware with `zustand/middleware` and `IndexedDB` (via `idb-keyval`) for instant offline-first rendering.
- **Backend Schema (Supabase PostgreSQL)**:
  - Table `sessions`: `id (uuid)`, `patient_id (uuid)`, `title (text)`, `group (text)`, `created_at (timestamp)`.
  - Table `messages`: `id (uuid)`, `session_id (uuid)`, `role ('user'|'assistant'|'system')`, `content (text)`, `tokens_used (int)`, `created_at (timestamp)`.
- **Synchronization Strategy**:
  - Sync via `@tanstack/react-query` or optimistic Zustand updates with background REST / Supabase realtime sync.

---

### Step 2: Conversation Filtering & Search Strategy

**Goal**: Fast client-side instant filtering + server-side full-text search.

- **Client Instant Search**:
  - Use lightweight fuzzy search package (`flexsearch` or `fuse.js`) inside `features/shell/config/navigation.ts` & chat store to instantly filter `SESSION_GROUPS` without latency.
- **Server Full-Text Search**:
  - Leverage Supabase PostgreSQL `pg_trgm` (trigram matching) and `tsvector` indexes on `messages.content`.
  - API Route `app/api/chat/search/route.ts`: Returns matching sessions with highlighted snippets.

---

### Step 3: Context Sessions & Long-Term Memory (Short-Term vs. Long-Term)

**Goal**: Prevent token window overflow while retaining medical context across months.

- **Short-Term Active Context**:
  - Maintain a sliding window of the last 10-15 messages in active prompt context.
- **Long-Term Memory Extraction**:
  - When a session ends or exceeds 20 messages, trigger an automatic background summary job (`app/api/ai/summarize/route.ts`).
  - Store extracted key health facts (allergies, med changes, reported symptoms) in table `patient_health_memories` (`patient_id`, `fact_type`, `fact_value`, `confidence`, `timestamp`) from the user as well as the clinician as they conversate.
  - Render as `.memchip` ("Memory updated: Penicillin allergy noted") in the chat UI.

---

### Step 4: RAG Pipeline with Supabase Vector (`pgvector`)

**Goal**: Enable AI to retrieve relevant medical documents and past timeline events.

- **Embedding Generation**:
  - When a document is uploaded via `app/api/documents/route.ts`, parse text using `pdf-parse` or `tesseract.js` (OCR for lab scans).
  - Generate 1536-dimensional embeddings using OpenAI `text-embedding-3-small` or Cohere embeddings.
- **Supabase `pgvector` Storage**:
  - Table `document_embeddings`: `id`, `document_id`, `chunk_content (text)`, `embedding (vector(1536))`, `metadata (jsonb)`.
- **Hybrid Retrieval Strategy**:
  - Combine vector similarity search (`match_documents` RPC function in PostgreSQL) with keyword Reciprocal Rank Fusion (RRF).
  - Inject retrieved chunks into system prompt under `<retrieved_medical_context>` tags.

---

### Step 5: Main Database Query Pipeline (Structured EHR Data)

**Goal**: Query structured health vitals, lab values, and medication histories safely.

- **Structured Tables**:
  - `patients`, `vitals` (bp, hr, temp, weight), `medications` (drug_name, dosage, frequency), `lab_results`.
- **AI Tool-Calling (Function Calling)**:
  - Provide Vercel AI SDK (`ai`) function tools to the LLM:
    - `get_patient_vitals({ patient_id, metric, date_range })`
    - `get_active_medications({ patient_id })`
    - `get_timeline_events({ patient_id, category })`
  - The AI executes read-only PostgreSQL RPC functions to present accurate clinical data.

---

### Step 6: Clinician Presentation & Input Filtering

**Goal**: Present patient insights clearly to clinicians while preventing prompt injection and data leaks.

- **Clinician Dashboard Presentation**:
  - Summarize AI chat conversations into structured Clinical Hypotheses with evidence support meters (`supbar`).
  - Timeline feed showing verified patient events alongside unverified AI reported symptoms.
- **Input Sanitization & Security Filtering**:
  - Use `DOMPurify` / `sanitize-html` on all user & clinician inputs.
  - Apply `zod` schema validation for all API route payloads.
  - Implement PII/PHI redaction layer before sending queries to external LLM providers.

---

### Step 7: DRY Principles & Open-Source Package Integration

**Goal**: Maximize velocity and prevent code duplication.

| Capability                | Recommended Open-Source Package | Purpose                                                 |
| :------------------------ | :------------------------------ | :------------------------------------------------------ |
| **Backend & Vector DB**   | `@supabase/supabase-js`         | Auth, PostgreSQL, Realtime, `pgvector`                  |
| **AI Streaming & Tools**  | `ai` (Vercel AI SDK)            | Standardized streaming, tool execution, model providers |
| **Data Validation**       | `zod`                           | API payload & state schema validation                   |
| **Client Search**         | `fuse.js` / `flexsearch`        | Zero-latency instant conversation filtering             |
| **Data Fetching & Cache** | `@tanstack/react-query`         | Server state management, auto-refetching, caching       |
| **Security Sanitization** | `dompurify`                     | XSS prevention on user and clinician inputs             |
| **File Parsing**          | `pdf-parse`                     | Extract text from uploaded medical PDFs                 |

---

## 🎯 Implementation Roadmap (Recipe Execution Sequence)

1. **Milestone 1**: Integrate Supabase client & define PostgreSQL schema migrations.
2. **Milestone 2**: Upgrade `features/chat` store with persistent storage and Fuse.js filtering.
3. **Milestone 3**: Implement RAG pipeline in `app/api/ai/chat/route.ts` with `pgvector`.
4. **Milestone 4**: Connect structured EHR tool-calling for patient vitals and medications.
5. **Milestone 5**: Refine Clinician dashboard hypothesis meters & patient sharing lease timers.
