# Mhistree Master Technical Blueprint & Production Execution Recipe (`TODO.md`)

Welcome to the **Mhistree Master Development Recipe**. This document is a comprehensive, step-by-step technical guide for building a healthcare AI system. It is structured so that any human developer or AI coding agent can follow each step incrementally—building new capabilities layer by layer without breaking previous functionality.

---

## 📌 Core Architectural Philosophy

1. **Longitudinal Health Record is the Primary Asset**:
   - The conversational chat interface is an **interaction window** for fluid patient/clinician dialogue.
   - The **core product value** is the patient's **Longitudinal Electronic Health Record (EHR)**—a structured, searchable, and verified medical history built over time from chats, uploaded documents, lab scans, vitals, and clinician notes.
2. **Model Agnosticism & Pluggable AI**:
   - No lock-in to a single AI provider.
   - Standardized provider abstraction allowing seamless switching between OpenAI (`gpt-4o`), Anthropic (`claude-3-5-sonnet`), Google Gemini (`gemini-1.5-pro`), OpenRouter, or **Local Offline Models via Ollama** (`meditron`, `biomistral`, `llama3-med`).
   - Task-specific routing: Vision models for lab scans/x-rays, fast 8B models for entity extraction, high-reasoning models for clinical hypothesis generation.
3. **Dual-Contributor Health Memory**:
   - Both **Patients** (via chat & uploads) and **Clinicians** (via consultation notes & verified diagnoses) continuously enrich the patient's `health_memories` and structured EHR tables.
4. **Standardized Medical Ontologies**:
   - Native mapping to clinical terminologies: **SNOMED CT** (clinical findings/diseases), **ICD-10-CM** (diagnostic codes), **LOINC** (lab measurements), and **RxNorm** (medications).
5. **DRY & Modular Construction**:
   - Built on top of battle-tested open-source packages: `@supabase/supabase-js`, Vercel AI SDK (`ai`), `@tanstack/react-query`, `zod`, `fuse.js`, `pdf-parse`, `tesseract.js`, `dompurify`.

---

## 🟢 Section 1: Current Codebase Audit (What Is Implemented)

The project currently has a production-ready frontend shell:

- **Directory Layout**: Next.js 15 App Router using **Feature-First Architecture**:
  - `features/shell`: Header, Patient & Clinician navigation, mobile drawer (`AppShell`).
  - `features/chat`: Chat UI components, message rendering, mock session grouping (`Today`, `Yesterday`, `Previous 7 days`), streaming API route (`app/api/ai/chat/route.ts`).
  - `features/health`: Patient health timeline (`TimelineEventCard`), health metric cards, and vitals.
  - `features/documents`: Document list (`DocCard`), preview drawer, upload endpoint (`app/api/documents/route.ts`).
  - `features/sharing`: Patient consent sharing wizard (`ShareWizardModal`), active access leases, emergency OTP.
  - `features/clinician`: Clinician dashboard (`PatientHeader`), patient list, clinical hypothesis meters (`supbar`), and timeline feed.
- **Design System**:
  - **Soft-Float UI** system defined in `app/globals.css`.
  - **Qwenthree Layered Dark Mode** (`#0E0E10` stage, `#191A1C` / `#1F2023` shells, `#28292C` cards, `#3C3D42` active tabs) with circular avatars and 4px custom soft-float scrollbars.

---

## 🧱 Section 2: Layer-by-Layer Production Recipe Book

---

### Step 1: Infrastructure & Database Layer Setup (Foundation)

#### 🖐️ Manual Human Steps:

1. **Create Supabase Account & Project**:
   - Go to [Supabase Dashboard](https://supabase.com) and create a project named `mhistree-production`.
   - Copy your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings -> API.
   - Copy your `SUPABASE_SERVICE_ROLE_KEY` (for secure server-side routes).
2. **Configure Environment Variables**:
   - Create `.env.local` in the project root:

     ```env
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

     # AI Model Provider Keys
     OPENAI_API_KEY=sk-...
     ANTHROPIC_API_KEY=sk-ant-...
     GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...
     OLLAMA_BASE_URL=http://localhost:11434
     ```

#### 💻 Developer Code Steps:

1. **Install Supabase Dependencies**:
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```
2. **Execute Database Migration SQL (Supabase SQL Editor)**:

   ```sql
   -- Enable vector extension for medical RAG embeddings
   CREATE EXTENSION IF NOT EXISTS vector;
   -- Enable pg_trgm for fast fuzzy medical search
   CREATE EXTENSION IF NOT EXISTS pg_trgm;

   -- 1. Patients Table
   CREATE TABLE public.patients (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     created_at TIMESTAMPTZ DEFAULT now(),
     full_name TEXT NOT NULL,
     date_of_birth DATE,
     blood_type VARCHAR(5),
     primary_physician_id UUID,
     emergency_contact JSONB
   );

   -- 2. Structured Health Vitals Table
   CREATE TABLE public.health_vitals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
     recorded_at TIMESTAMPTZ DEFAULT now(),
     vital_type VARCHAR(50) NOT NULL, -- 'blood_pressure', 'heart_rate', 'glucose', 'weight', 'temperature'
     numeric_value NUMERIC,
     text_value TEXT,
     unit VARCHAR(20),
     source VARCHAR(30) DEFAULT 'patient_reported' -- 'patient_reported', 'device_sync', 'clinician_entry'
   );

   -- 3. Structured Medications Table (RxNorm aligned)
   CREATE TABLE public.medications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
     rxnorm_code VARCHAR(20),
     drug_name TEXT NOT NULL,
     dosage TEXT NOT NULL,
     frequency TEXT NOT NULL,
     status VARCHAR(20) DEFAULT 'active', -- 'active', 'discontinued', 'completed'
     prescribed_by UUID,
     started_at DATE,
     ended_at DATE
   );

   -- 4. Longitudinal Health Memories Table (Dual-Contributor: Patient & Clinician)
   CREATE TABLE public.health_memories (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
     contributor_role VARCHAR(20) NOT NULL, -- 'patient', 'clinician', 'ai_extractor'
     contributor_id UUID,
     fact_category VARCHAR(50) NOT NULL, -- 'allergy', 'chronic_condition', 'family_history', 'lifestyle', 'symptom_trend'
     fact_summary TEXT NOT NULL,
     snomed_code VARCHAR(30),
     icd10_code VARCHAR(30),
     confidence_score NUMERIC(3,2) DEFAULT 1.00,
     is_verified BYPASSRLS BOOLEAN DEFAULT false,
     verified_by_clinician_id UUID,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   -- 5. Sessions & Chat Messages Tables
   CREATE TABLE public.chat_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     session_group VARCHAR(30) DEFAULT 'Today',
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE TABLE public.chat_messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
     role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'clinician_note'
     content TEXT NOT NULL,
     tokens_used INT DEFAULT 0,
     attachments JSONB DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

---

### Step 2: Model-Agnostic AI Provider Abstraction Layer

**Goal**: Allow switching AI models (OpenAI, Anthropic, Gemini, or Local Ollama) dynamically without refactoring feature code.

#### 💻 Developer Code Steps:

1. **Install Vercel AI SDK & Providers**:
   ```bash
   npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google ai-sdk-ollama
   ```
2. **Create Provider Registry Layer (`lib/ai/providers.ts`)**:

   ```typescript
   import { createOpenAI } from "@ai-sdk/openai";
   import { createAnthropic } from "@ai-sdk/anthropic";
   import { createGoogleGenerativeAI } from "@ai-sdk/google";
   import { createOllama } from "ai-sdk-ollama";

   // Initialize model providers
   const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
   const anthropic = createAnthropic({
     apiKey: process.env.ANTHROPIC_API_KEY || "",
   });
   const google = createGoogleGenerativeAI({
     apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
   });
   const ollama = createOllama({
     baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/api",
   });

   export type ModelTask =
     | "chat"
     | "extraction"
     | "clinical_reasoning"
     | "vision";

   export function getModel(task: ModelTask, requestedModel?: string) {
     if (requestedModel) {
       if (requestedModel.startsWith("ollama/"))
         return ollama(requestedModel.replace("ollama/", ""));
       if (requestedModel.startsWith("anthropic/"))
         return anthropic(requestedModel.replace("anthropic/", ""));
       if (requestedModel.startsWith("google/"))
         return google(requestedModel.replace("google/", ""));
       return openai(requestedModel);
     }

     // Default task-based model selection
     switch (task) {
       case "vision":
         return openai("gpt-4o"); // Best for medical document OCR/image analysis
       case "clinical_reasoning":
         return anthropic("claude-3-5-sonnet-20241022"); // Exceptional medical reasoning & differential diagnosis
       case "extraction":
         return openai("gpt-4o-mini"); // Fast, cost-effective entity extraction
       case "chat":
       default:
         return openai("gpt-4o");
     }
   }
   ```

---

### Step 3: Medical Vocabulary & Entity Extraction Engine

**Goal**: Automatically extract medical terms (diseases, symptoms, meds, allergies) from patient & clinician text and map them to SNOMED CT and ICD-10 codes.

#### 💻 Developer Code Steps:

1. **Install Validation & Utility Packages**:
   ```bash
   npm install zod flexsearch dompurify
   npm install -D @types/dompurify
   ```
2. **Create Medical Extractor Route (`app/api/ai/extract-medical/route.ts`)**:

   ```typescript
   import { generateObject } from "ai";
   import { z } from "zod";
   import { getModel } from "@/lib/ai/providers";

   const MedicalExtractionSchema = z.object({
     memories: z.array(
       z.object({
         fact_category: z.enum([
           "allergy",
           "chronic_condition",
           "family_history",
           "lifestyle",
           "symptom_trend",
         ]),
         fact_summary: z
           .string()
           .describe(
             "Clear medical statement, e.g., Patient experiences mild asthma triggered by cold weather",
           ),
         snomed_code: z
           .string()
           .optional()
           .describe("Matching SNOMED CT code if identifiable"),
         icd10_code: z
           .string()
           .optional()
           .describe("Matching ICD-10 code if identifiable"),
         confidence: z.number().min(0).max(1),
       }),
     ),
     vitals_detected: z.array(
       z.object({
         vital_type: z.enum([
           "blood_pressure",
           "heart_rate",
           "glucose",
           "weight",
           "temperature",
         ]),
         numeric_value: z.number(),
         unit: z.string(),
       }),
     ),
   });

   export async function POST(req: Request) {
     const { text, patient_id, contributor_role } = await req.json();

     const result = await generateObject({
       model: getModel("extraction"),
       schema: MedicalExtractionSchema,
       prompt: `You are a clinical NLP entity extraction engine. Extract all structured health memories, symptoms, and vitals from the following text:\n\n"${text}"`,
     });

     return Response.json(result.object);
   }
   ```

---

### Step 4: Multimodal Medical Document RAG Pipeline (`pgvector`)

**Goal**: Store medical PDFs, lab reports, and imaging scans, convert them into vector embeddings, and retrieve them during AI chats.

#### 🖐️ Manual Human Steps:

1. Enable Supabase Storage Bucket named `medical_documents` with private access rules (authenticated users only).

#### 💻 Developer Code Steps:

1. **Install File Extraction Tools**:
   ```bash
   npm install pdf-parse tesseract.js
   ```
2. **Create Supabase Vector Embeddings Table (`Supabase SQL Editor`)**:

   ```sql
   CREATE TABLE public.medical_document_chunks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
     document_name TEXT NOT NULL,
     file_url TEXT NOT NULL,
     chunk_index INT NOT NULL,
     chunk_text TEXT NOT NULL,
     embedding vector(1536),
     created_at TIMESTAMPTZ DEFAULT now()
   );

   -- Create HNSW Index for ultra-fast similarity search
   CREATE INDEX ON public.medical_document_chunks
   USING hnsw (embedding vector_cosine_ops);

   -- Matching function for RPC query
   CREATE OR REPLACE FUNCTION match_medical_chunks(
     query_embedding vector(1536),
     match_patient_id UUID,
     match_count INT DEFAULT 5
   )
   RETURNS TABLE (
     id UUID,
     document_name TEXT,
     chunk_text TEXT,
     similarity FLOAT
   )
   LANGUAGE plpgsql AS $$
   BEGIN
     RETURN QUERY
     SELECT
       mc.id,
       mc.document_name,
       mc.chunk_text,
       1 - (mc.embedding <=> query_embedding) AS similarity
     FROM public.medical_document_chunks mc
     WHERE mc.patient_id = match_patient_id
     ORDER BY mc.embedding <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   ```

3. **Document Ingestion Endpoint (`app/api/documents/ingest/route.ts`)**:
   - Parses text from PDF/Images.
   - Generates embeddings using `openai.embedding('text-embedding-3-small')`.
   - Inserts chunks into `medical_document_chunks`.

---

### Step 5: Dual-Contributor Chat & Continuous Health Memory Sync

**Goal**: Wire patient & clinician interactions to continuously update `health_memories` and render memory chips (`.memchip`).

#### 💻 Developer Code Steps:

1. **Update Streaming AI Route (`app/api/ai/chat/route.ts`)**:
   - Fetches active patient context:
     - Verified `health_memories` from Supabase.
     - Recent `health_vitals` and active `medications`.
     - Relevant RAG document chunks via `match_medical_chunks`.
   - Injects structured EHR data into System Prompt:
     ```text
     You are Mhistree AI, an empathetic clinical health assistant.
     <PATIENT_LONGITUDINAL_RECORD>
     Memories: [Penicillin Allergy, Type 2 Diabetes, Mild Hypertension]
     Vitals: Blood Pressure: 128/82 mmHg (Yesterday)
     Medications: Metformin 500mg (Active)
     </PATIENT_LONGITUDINAL_RECORD>
     ```
   - Streams response to client.
   - Triggers background job to extract new `health_memories` from the conversation turn.

---

### Step 6: Clinician Workspace & Collaborative EHR Enrichment

**Goal**: Enable clinicians to view patient timeline, inspect AI hypothesis confidence meters (`supbar`), converse with AI, and verify/add health history entries.

#### 💻 Developer Code Steps:

1. **Clinician Note & Verification Endpoint (`app/api/clinician/verify-memory/route.ts`)**:
   - Clinician reviews unverified memory -> clicks "Verify".
   - Updates `health_memories.is_verified = true` and records `verified_by_clinician_id`.
   - Instantly reflects on patient timeline with a verified checkmark badge.

---

### Step 7: Security, Input Sanitization & Audit Logging

**Goal**: Prevent prompt injection, sanitize inputs, and maintain an audit log for healthcare compliance.

#### 💻 Developer Code Steps:

1. **Input Sanitization Middleware (`lib/security/sanitize.ts`)**:

   ```typescript
   import DOMPurify from "isomorphic-dompurify";

   export function sanitizeInput(rawText: string): string {
     return DOMPurify.sanitize(rawText.trim());
   }
   ```

2. **Audit Logging Table (`Supabase SQL Editor`)**:
   ```sql
   CREATE TABLE public.audit_logs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_id UUID NOT NULL,
     actor_role VARCHAR(20) NOT NULL, -- 'patient', 'clinician', 'system'
     action VARCHAR(50) NOT NULL, -- 'view_timeline', 'verify_memory', 'export_ehr'
     patient_id UUID REFERENCES public.patients(id),
     ip_address TEXT,
     timestamp TIMESTAMPTZ DEFAULT now()
   );
   ```

---

## 📊 Summary Checklist of Open-Source Packages

| Capability                | Package Name                                                                   | Command                                                                        |
| :------------------------ | :----------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Database & Vector**     | `@supabase/supabase-js`                                                        | `npm install @supabase/supabase-js @supabase/ssr`                              |
| **AI Abstraction**        | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `ai-sdk-ollama` | `npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google ai-sdk-ollama` |
| **Validation & Schema**   | `zod`                                                                          | `npm install zod`                                                              |
| **Client Search**         | `fuse.js`                                                                      | `npm install fuse.js`                                                          |
| **Security Sanitization** | `dompurify`, `isomorphic-dompurify`                                            | `npm install dompurify isomorphic-dompurify`                                   |
| **PDF Extraction**        | `pdf-parse`                                                                    | `npm install pdf-parse`                                                        |
| **OCR Extraction**        | `tesseract.js`                                                                 | `npm install tesseract.js`                                                     |

---

## 🚀 Execution Strategy

Follow this sequence step-by-step:

1. Execute **Step 1** (Supabase setup + SQL migrations).
2. Execute **Step 2** (Provider registry layer in `lib/ai/providers.ts`).
3. Execute **Step 3** (Medical extraction endpoint).
4. Execute **Step 4** (Multimodal document RAG pipeline).
5. Execute **Step 5** (Dual-contributor chat & continuous health memory sync).
6. Execute **Step 6** (Clinician workspace verification).
7. Execute **Step 7** (Security & audit logging).
