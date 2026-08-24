# Mhistree — `idea_scaffold.md`

## Ideal MVP Scaffold + Product Implementation Architecture

**Document purpose:** This is the master scaffold for building the Mhistree MVP with Next.js, Supabase/PostgreSQL/pgvector, Zustand, Tailwind CSS, and a replaceable LLM provider layer.

**Primary source basis:** the supplied Mhistree product/AI architecture documents. The design preserves the core product rules: Mhistree is a longitudinal health companion rather than an autonomous diagnostician; clinical truth lives in a structured, provenance-aware ledger; personal and health contexts are separated; new technical chat sessions still inherit selected durable memory; and clinician access is patient-authorized, scoped and time-limited.

**Implementation target:** a modular monolith first. Keep modules clean enough that background workers, ingestion, document processing, embeddings, or integrations can later be extracted without redesigning the product.

---

# 1. Product Shape

Mhistree has two primary experiences:

```text
PATIENT
    ↓
AI companion
    ↓
Personal context + Health context
    ↓
Longitudinal timeline
    ↓
Profile / health record
    ↓
Documents / measurements
    ↓
Patient-controlled sharing
    ↓
Clinician

CLINICIAN
    ↓
Authenticated clinician workspace
    ↓
Patient roster / active leases
    ↓
Patient EMR-like record
    ↓
AI clinical summary + timeline + evidence
    ↓
Verify / correct / document / act
```

The core product promise is that health is continuous even though healthcare visits are episodic. Mhistree turns everyday interactions, measurements, documents and verified clinical information into a time-aware health history while preserving provenance and privacy.

The supplied product vision explicitly positions Mhistree as a living medical history, structured health timeline and clinician assistant, not as a replacement for a doctor or an autonomous diagnosis system. fileciteturn0file2L12-L17

---

# 2. The MVP Mental Model

Use this hierarchy:

```text
Identity
  └── User
       ├── Personal Context
       │    ├── chat sessions
       │    ├── chat messages
       │    ├── personal memories
       │    └── preferences
       │
       └── Health Context
            ├── health profile
            ├── clinical events
            ├── observations / vitals
            ├── medications
            ├── conditions
            ├── encounters
            ├── documents
            ├── episodes
            ├── health memories
            ├── summaries
            └── provenance/evidence
```

A third protected layer sits beside these:

```text
Security / Governance
    ├── consent
    ├── leases
    ├── audit events
    ├── organization membership
    └── access policies
```

And a fourth internal layer:

```text
System / AI
    ├── provider configuration
    ├── prompt versions
    ├── model versions
    ├── feature flags
    ├── evaluation metadata
    └── jobs
```

The architecture documents explicitly define Personal Context, Health Context, Security/Audit Context and System Context, with hard namespace isolation for vectors and retrieval. A clinician lease must never allow retrieval from the personal namespace.

---

# 3. Technical Stack

## Required stack

```text
Frontend
  Next.js App Router
  React
  TypeScript
  Tailwind CSS
  Zustand
  radix ui for components it should be styled with tailwind css
  motion for animations
  recharts for charts


Backend
  Next.js Route Handlers / server-side modules
  TypeScript

Auth
  Supabase Auth

Database
  Supabase PostgreSQL
  PostgreSQL JSONB
  pgvector

Storage
  Supabase Storage

AI
  Internal Mhistree LLM Gateway
  Pluggable provider adapters
  Any compatible LLM API

Background processing
  Supabase-compatible jobs/queue strategy initially
  Database-driven job table + worker/cron or external worker
  Designed so a queue can later move to a dedicated worker

Observability
  structured application logs
  AI request metadata
  audit event storage
  model/version/request IDs

Future interoperability
  FHIR R4 adapter
  NHIA/HMO export adapter
```

Supabase currently documents `@supabase/ssr` for cookie-based Next.js server-side authentication, with separate browser and server clients. Supabase also documents pgvector as the Postgres extension for storing/querying embeddings.

---

# 4. Architectural Principle: Make the LLM Replaceable

This is one of the most important requirements for the project.

## Never do this

```ts
// BAD
import { SomeSpecificSDK } from "some-provider";

const result = await SomeSpecificSDK.chat(...)
```

inside:

- chat pages
- Zustand stores
- timeline components
- clinical services
- memory services
- extraction services
- API routes

That makes the product provider-dependent.

## Do this instead

```text
UI
 ↓
Next.js API Route
 ↓
Mhistree AI Service
 ↓
LLM Gateway
 ↓
Provider Adapter
 ↓
Gemini / DeepSeek / OpenAI / Anthropic / OpenRouter / local model / future provider
```

The rest of the application knows only the gateway contract.

---

# 5. Provider-Abstraction Contract

Create one stable internal contract.

Suggested structure:

```text
src/
  lib/
    ai/
      gateway.ts
      types.ts
      config.ts
      providers/
        openai-compatible.ts
        gemini.ts
        anthropic.ts
        deepseek.ts
        openrouter.ts
        local.ts
      prompts/
        patient.ts
        clinician.ts
        extraction.ts
        summarization.ts
      schemas/
        response.ts
        extraction.ts
        memory.ts
```

The most important file is:

```text
src/lib/ai/gateway.ts
```

Everything else calls:

```ts
ai.chat(...)
ai.stream(...)
ai.extract(...)
ai.summarize(...)
ai.embed(...)
```

The application never calls a vendor SDK directly.

---

# 6. Recommended LLM Interface

Use capability-based interfaces rather than one giant provider API.

```ts
export interface LLMProvider {
  id: string;

  chat(input: ChatRequest): Promise<ChatResponse>;

  stream(input: ChatRequest): AsyncIterable<ChatChunk>;

  structured<T>(input: StructuredRequest<T>): Promise<T>;

  embed?(input: EmbeddingRequest): Promise<EmbeddingResponse>;

  healthCheck?(): Promise<ProviderHealth>;
}
```

Then create a single registry:

```ts
const providers = {
  openrouter: createOpenRouterProvider(),
  deepseek: createDeepSeekProvider(),
  gemini: createGeminiProvider(),
  openai: createOpenAIProvider(),
};
```

Selection:

```env
AI_PROVIDER=openrouter
AI_MODEL=...
```

The goal is:

```text
Change provider:
    AI_PROVIDER

Change model:
    AI_MODEL

Change API key:
    AI_API_KEY

No page/component rewrite.
No Zustand rewrite.
No database rewrite.
No memory rewrite.
No timeline rewrite.
```

---

# 7. Even Better: Separate Provider From Model

Do not hard-code:

```text
"deepseek-chat"
```

throughout the project.

Use:

```text
provider
model
capabilities
```

as configuration.

Example:

```ts
export const aiConfig = {
  patientConversation: {
    provider: process.env.AI_PROVIDER!,
    model: process.env.AI_PATIENT_MODEL!,
  },

  clinicianAssistant: {
    provider: process.env.AI_CLINICIAN_PROVIDER!,
    model: process.env.AI_CLINICIAN_MODEL!,
  },

  extraction: {
    provider: process.env.AI_EXTRACTION_PROVIDER!,
    model: process.env.AI_EXTRACTION_MODEL!,
  },

  embeddings: {
    provider: process.env.AI_EMBEDDING_PROVIDER!,
    model: process.env.AI_EMBEDDING_MODEL!,
  },
};
```

This lets one provider handle conversation while another handles embeddings or extraction.

---

# 8. Do Not Tie Embeddings to the Conversation Provider

The embedding model is an independent dependency.

```text
Chat model
    ≠
Embedding model
    ≠
Extraction model
    ≠
Safety/rules engine
```

If the chat model changes, the vector database should continue to work.

If the embedding model changes, version embeddings:

```text
embedding_model
embedding_dimensions
embedding_version
```

Never silently mix incompatible vector dimensions.

---

# 9. Mhistree Backend Boundary

Use the following architecture:

```text
Browser
  ↓
Next.js UI
  ↓
Route Handler
  ↓
Application Service
  ↓
Domain Service
  ├── Context Router
  ├── Memory Service
  ├── Clinical Ledger
  ├── Consent/Lease Service
  ├── Document Service
  └── AI Gateway
       ↓
       Provider Adapter
       ↓
       External LLM
```

Supabase should remain the database/auth/storage system, not become the place where business rules are scattered across frontend components.

---

# 10. Next.js Structure

Recommended high-level tree:

```text
src/
├── app/
│   ├── (marketing)/
│   ├── (auth)/
│   ├── (patient)/
│   ├── (clinician)/
│   ├── api/
│   └── layout.tsx
│
├── components/
│   ├── ui/
│   ├── shell/
│   ├── chat/
│   ├── patient/
│   ├── timeline/
│   ├── health/
│   ├── clinician/
│   ├── documents/
│   └── sharing/
│
├── lib/
│   ├── supabase/
│   ├── ai/
│   ├── auth/
│   ├── authorization/
│   ├── context/
│   ├── memory/
│   ├── clinical/
│   ├── timeline/
│   ├── documents/
│   ├── leases/
│   ├── audit/
│   └── fhir/
│
├── stores/
│   ├── chat-store.ts
│   ├── ui-store.ts
│   ├── timeline-store.ts
│   ├── profile-store.ts
│   └── clinician-store.ts
│
├── types/
├── schemas/
├── hooks/
└── config/
```

Next.js Route Handlers live under the `app` directory and support the normal HTTP methods. Current Next.js documentation also describes `proxy.ts` as the current request interception convention; `middleware` has been renamed/deprecated in favor of Proxy.

---

# 11. Route Groups

Keep role-specific interfaces isolated:

```text
app/
├── (auth)/
│   ├── login/
│   ├── signup/
│   ├── verify/
│   └── onboarding/
│
├── (patient)/
│   ├── chat/
│   ├── timeline/
│   ├── health/
│   ├── profile/
│   ├── documents/
│   ├── sharing/
│   └── settings/
│
├── (clinician)/
│   ├── dashboard/
│   ├── patients/
│   ├── patients/[patientId]/
│   ├── patients/[patientId]/timeline/
│   ├── patients/[patientId]/documents/
│   ├── patients/[patientId]/encounters/
│   ├── ai/
│   └── settings/
│
└── api/
```

---

# 12. Patient Routes

## `/chat`

This is the primary product surface.

It should feel inspired by the interaction model of ChatGPT:

```text
Left Sidebar
    ├── New chat
    ├── Home / AI
    ├── Timeline
    ├── Health
    ├── Documents
    ├── Sharing
    ├── recent conversations
    └── profile + settings at bottom

Main Area
    ├── session header
    ├── conversation
    ├── attachments
    ├── citations/evidence where applicable
    └── composer
```

Every opening of a new conversation creates a new technical `session_id`, while the context router retrieves selected durable memory. This is a core Mhistree requirement.

---

# 13. Patient Chat Requirements

The chat must support:

```text
text
voice later
documents
images later
measurements
health questions
casual conversation
memory callbacks
timeline-linked references
safety escalation
```

The assistant should not become an intake form.

---

# 14. Patient Sidebar

The sidebar should be persistent on desktop and collapsible on mobile.

## Top

```text
Mhistree logo
New chat
```

## Navigation

```text
AI
Timeline
Health
Documents
Sharing
```

## Conversation history

```text
Today
Yesterday
Previous 7 days
Older
```

Recent chat titles should come from sessions, not from manually duplicated client state.

## Bottom

```text
Profile avatar
Name
Status / plan
Settings
Help
Sign out
```

---

# 15. Patient `/timeline`

This is one of the most important pages.

It is not simply a list.

It should be the visual representation of:

```text
Life
 ↓
Health events
 ↓
Episodes
 ↓
Clinical history
```

Features:

```text
Date range
Search
Filter
Topic
Event type
Source/provenance
Verified/unverified
Episode
Medication
Symptom
Lab
Visit
Vital
Document
```

The architecture documents explicitly call for a chronological, filterable, provenance-tagged timeline; topic grouping; episodes; trends; evidence drawers; and patient correction flows.

---

# 16. Patient `/health`

This is the concise health dashboard.

It can contain:

```text
Health overview
    ├── allergies
    ├── active conditions
    ├── medications
    ├── recent vitals
    ├── recent episodes
    ├── upcoming appointments
    └── health trends
```

Baseline information should be stored structurally, not merely as vector memory.

---

# 17. Patient `/profile`

The profile should resemble a modern, readable personal EMR summary rather than a social media profile.

## Header

```text
Avatar
Full name
Date of birth
Preferred name
Gender/sex where collected
Contact
```

## Health identity

```text
Blood group
Genotype
Allergies
Emergency contacts
```

## Medical baseline

```text
Active conditions
Past conditions
Medications
Procedures
Family history
Relevant lifestyle information
```

## Verification

Every clinically meaningful fact can show:

```text
Self-reported
Clinician verified
Lab verified
Device-derived
AI inferred
```

## Sections

Recommended:

```text
Overview
Personal information
Medical baseline
Medications
Allergies
Conditions
Vitals
Devices
Emergency information
Care team
Access history
```

---

# 18. Patient `/documents`

MVP document types:

```text
Lab result
Prescription
Discharge summary
Imaging report
Referral
Medical letter
Other
```

Features:

```text
Upload
Preview
Metadata
Source
Date
Associated encounter
Associated event
AI extraction status
Evidence links
Correction flow
```

---

# 19. Patient `/sharing`

Primary action:

```text
Share my health context
```

Flow:

```text
Choose purpose
    ↓
Choose scope
    ↓
Choose duration
    ↓
Review
    ↓
Generate OTP / QR
    ↓
Doctor redeems
    ↓
Lease becomes active
    ↓
Patient can see active access
```

The patient-controlled lease is purpose-, duration- and scope-based and excludes Personal Context under the normal clinician lease.

---

# 20. Patient `/settings`

Settings should be divided by concern instead of one giant form.

## Account

```text
Name
Email
Phone
Password/security
Sign out sessions
```

## Conversation

```text
Preferred name
Language
Tone
Concise vs detailed
Voice preferences
```

## Notifications

```text
Health reminders
Appointment reminders
Document processing
Clinician access alerts
Safety notifications
Email
Push
```

## Privacy

```text
Personal memory
Health memory
Data sharing
Active leases
Access history
AI data controls
```

## Security

```text
2FA / MFA later
Passkeys later
Active sessions
Security events
```

## Data

```text
Export my data
Download medical history
Request correction
Request deletion where legally eligible
```

## Appearance

```text
Theme
Density
Reduced motion
```

---

# 21. Supporting AI Surfaces

The AI should not be trapped inside the main `/chat`.

Add contextual AI entry points:

```text
Timeline → Ask about this timeline
Event → Explain this event
Health → Ask about my health
Document → Ask about this document
Profile → Ask about my health profile
```

These should open a contextual assistant drawer or panel rather than necessarily navigating away.

---

# 22. Clinician Route Architecture

```text
/clinician/dashboard
/clinician/patients
/clinician/patients/[patientId]
/clinician/patients/[patientId]/timeline
/clinician/patients/[patientId]/documents
/clinician/patients/[patientId]/encounters
/clinician/settings
```

---

# 23. Clinician Sidebar

```text
Mhistree
Clinical workspace

Dashboard
Patients
Active consultations
Alerts

Recent patients / active leases

Settings
Profile
Help
Sign out
```

Do not make patient discovery behave like a public directory. The MVP calls for an active patient lease/roster rather than unrestricted global discovery.

---

# 24. Clinician `/dashboard`

Top-level layout:

```text
Top
    today's schedule
    alerts
    active consultations

Main
    active patient queue
    urgent review queue
    recently accessed patients
    pending verification tasks
```

The clinician should reach a patient record quickly.

---

# 25. Clinician `/patients`

Roster page.

Columns/cards:

```text
Patient
Lease status
Last encounter
Urgent items
Last health update
Pending verification
```

Filters:

```text
Active lease
Needs review
Urgent
Recent
Assigned to me
```

---

# 26. Clinician `/patients/[patientId]`

This is the clinician EMR-style patient workspace.

Use the architecture's recommended three-column design:

```text
COLUMN 1
AI Clinical Summary

COLUMN 2
Patient Header
Timeline
Labs
Medications
Vitals
Documents

COLUMN 3
AI / Clinical Action Console
```

---

# 27. Clinician Patient Header

Show:

```text
Patient name
Age / DOB
Sex where applicable
Blood group
Genotype
Allergies
Active conditions
Current medications
Lease timer
Source/verification status
```

Add a prominent:

```text
Access expires in 23 min
```

---

# 28. Clinician Timeline

Similar to patient timeline but denser.

Include:

```text
Episodes
Symptoms
Vitals
Labs
Medications
Diagnoses
Procedures
Encounters
Documents
Corrections
Clinician notes
```

Every item should expose evidence.

---

# 29. Clinician Verification Console

Actions:

```text
Verify
Reject
Correct
Mark as uncertain
Supersede
Add clinician note
Attach source
```

Never mutate the original AI extraction silently.

---

# 30. Clinician AI

The clinician AI is not another generic chatbot.

It is a patient-file reasoning interface.

Questions such as:

```text
"Summarize what changed in the last 30 days."
"What symptoms are recurring?"
"What is still unverified?"
"What medications have changed?"
"What information is missing for today's encounter?"
"Show evidence supporting this hypothesis."
```

The AI must stay within:

```text
active patient
+
active lease
+
allowed Health Context
```

It must not retrieve Personal Context.

---

# 31. Clinical Hypotheses UI

Do not display fake probabilities such as `Asthma: 88%` unless a validated model exists.

For MVP use:

```text
Low support
Moderate support
High support
```

with:

```text
Evidence
Model version
Timestamp
Clinical caveat
```

---

# 32. Shared Evidence Drawer

Every health object can call:

```text
EvidenceDrawer
```

Supported objects:

```text
timeline event
profile fact
medication
condition
vital
summary statement
AI hypothesis
document
```

Drawer sections:

```text
Why am I seeing this?
Source
Original evidence
Created by
Date
Status
Related records
```

---

# 33. Shared Correction Dialog

User clicks:

```text
This is incorrect
```

Dialog:

```text
What's wrong?

[Text]

[Submit correction]
```

Then:

```text
Correction received
```

The UI should communicate that the original record is preserved and the correction becomes a new state rather than silently deleting history.

---

# 34. Global Empty States

Every major page needs a proper empty state.

## Chat

```text
Start a conversation
```

## Timeline

```text
Your health timeline will appear here
as Mhistree learns from meaningful events.
```

## Documents

```text
No medical documents yet
[Upload document]
```

## Sharing

```text
No active health access
```

## Clinician patients

```text
No active patient access
```

Avoid blank white screens.

---

# 35. Loading / Error States

Use skeletons for:

```text
patient header
timeline
health cards
document list
clinician summary
```

Chat should use streaming response and typing indicators.

Important visible states:

```text
AI unavailable
Timeline unavailable
Document upload failed
Lease expired
Lease revoked
No access
Record conflict
Evidence unavailable
Extraction pending
```

For AI failure:

```text
Mhistree AI is temporarily unavailable.

Your health record is still available.

[View timeline]
```

---

# 36. Command Menu

A global command menu can make the app feel familiar to ChatGPT users.

Actions:

```text
New chat
Open timeline
Open health
Upload document
Share health
Open profile
Open settings
Search my health history
```

On desktop:

```text
Cmd/Ctrl + K
```

On mobile, use a search/action button.

---

# 37. Patient Navigation Logic

```text
AI
  → conversation

Timeline
  → longitudinal record

Health
  → current health state

Documents
  → evidence

Sharing
  → access control

Profile
  → identity + baseline health

Settings
  → preferences + governance
```

---

# 38. Clinician Navigation Logic

```text
Dashboard
  → What needs attention?

Patients
  → Who am I currently caring for?

Patient
  → What is this patient's record?

Timeline
  → What happened?

Documents
  → What evidence exists?

Encounter
  → What happened in this clinical interaction?

AI
  → What does the evidence suggest / what is missing?

Verification
  → What needs my clinical authority?
```

---

# 39. Mobile Patient UI

On mobile:

```text
Top bar
    logo / page title
    profile or menu

Main content

Bottom navigation
    AI
    Timeline
    Health
    Profile
```

Recent conversations still live inside the opened sidebar.

The chat composer should remain visually anchored at the bottom.

---

# 40. Mobile Clinician UI

Do not shrink the desktop three-column layout.

Instead:

```text
Patient header
↓
AI summary
↓
Timeline
↓
Clinical actions
```

Use a sticky bottom action bar:

```text
[AI]
[Verify]
[Note]
[More]
```

---

# 41. Visual Language Across the Product

All pages should share:

```text
soft neutral background
large rounded panels
restrained color palette
soft elevation
pill controls
dark primary CTA
clear provenance chips
generous whitespace
```

Patient AI should feel friendly.

Clinical workspace should feel precise.

The underlying visual language should remain consistent.

---

# 42. Main Page Inventory

## Patient

```text
/auth/login
/auth/signup
/onboarding

/chat
/timeline
/health
/profile
/documents
/sharing
/settings
```

## Clinician

```text
/clinician/dashboard
/clinician/patients
/clinician/patients/[patientId]
/clinician/patients/[patientId]/timeline
/clinician/patients/[patientId]/documents
/clinician/patients/[patientId]/encounters
/clinician/settings
```

## Supporting overlays

```text
Ask Mhistree
Evidence
Correction
Share
Upload
Document viewer
Profile editor
```

---

# 43. Minimum Frontend Components

## Shell

```text
AppShell
PatientShell
ClinicianShell
Sidebar
MobileNav
TopBar
CommandMenu
```

## Chat

```text
ChatPage
ConversationList
MessageList
MessageBubble
Composer
AttachmentTray
StreamingResponse
AIContextDrawer
```

## Timeline

```text
TimelinePage
TimelineFilters
Timeline
TimelineEvent
EpisodeCard
EvidenceDrawer
CorrectionDialog
```

## Health

```text
HealthDashboard
HealthFactCard
VitalCard
MedicationCard
ConditionCard
TrendCard
```

## Profile

```text
ProfilePage
ProfileHeader
ProfileSection
HealthFact
ProfileEditor
```

## Documents

```text
DocumentList
DocumentCard
DocumentViewer
DocumentUpload
DocumentEvidence
```

## Sharing

```text
SharingPage
LeaseCard
ShareWizard
QRCode
AccessHistory
```

## Clinician

```text
ClinicianDashboard
PatientRoster
PatientHeader
ClinicalSummary
ClinicalTimeline
VerificationConsole
ClinicianAI
EncounterView
```

---

# 44. First-Load Product Experience

New patient:

```text
Login
 ↓
Onboarding explanation
 ↓
Basic profile
 ↓
Basic health profile
 ↓
Privacy / sharing explanation
 ↓
Chat
```

The onboarding must explain what Mhistree stores, what AI does, what doctors can see, and what stays private.

---

# 45. The ChatGPT-Like Principle

Borrow the **interaction architecture**, not the content.

Borrow:

```text
persistent left rail
recent chats
new chat
profile at bottom
settings near profile
large conversation canvas
simple composer
contextual drawers
```

Make Mhistree-specific:

```text
Timeline
Health
Documents
Sharing
Evidence
Provenance
Clinical access
Clinician workspace
```

The goal is for a user already comfortable with ChatGPT to understand Mhistree within seconds.

---

# 46. The Product Should Feel Like One App

Avoid:

```text
Chat app
Medical record app
Doctor portal
Document app
```

looking like four separate products.

Instead:

```text
Mhistree
 ├── Talk
 ├── Remember
 ├── Understand
 ├── Record
 └── Share
```

These are different views into one continuous health history.

---

# 47. Final Frontend Rule

The UI should always answer:

```text
What is happening?
What does Mhistree know?
Where did it come from?
Who can see it?
What can I do next?
```

For patients, emphasize:

```text
clarity
control
continuity
trust
```

For clinicians, emphasize:

```text
speed
evidence
scope
verification
clinical context
```

The two interfaces should feel related but not identical.

---

# 48. Frontend Definition of Done

The patient UI is complete when a user can:

```text
sign up
complete onboarding
open a new chat
see recent chats
chat with Mhistree
open timeline
inspect an event
view evidence
correct an event
view health profile
view medications/conditions/allergies
upload a document
ask AI about a document
share health context
see active access
revoke access
change settings
```

The clinician UI is complete when a clinician can:

```text
sign in
see dashboard
see active patient roster
redeem a lease
open a patient
see patient header
see AI briefing
see timeline
filter events
open evidence
verify/correct events
view documents
review encounters
use patient-scoped AI
see lease expiration
```

That is the frontend MVP.

---

IMPILIMENTATION PLAN YOU CAN USE AS A GUIDE TO BUILD THE APP. NOTE : THIS IS A GUIDE AND NOT A STRICT SET OF RULES.

Implementation Plan: Mhistree Scalable Component & Folder Scaffold
This plan details the decomposition of the prototype in
mhistree/app/qwentwo/page.jsx
into a production-grade, highly modular, low-coupling Next.js (App Router) architecture backed by Tailwind CSS design layers, Zustand state stores, and clean route groups matching
docs/build_scaffold/idea_scaffold.md
.

User Review Required
IMPORTANT

Architecture & Routing Plan:

Modular Monolith Structure: All inline prototype code in
qwentwo/page.jsx
will be decomposed into atomic UI components, feature components, domain state stores, and page route handlers.
Clean Route Groups: Patient routes (/chat, /timeline, /health, /documents, /sharing, /profile, /settings) and Clinician routes (/clinician/dashboard, /clinician/patients, /clinician/patients/[patientId]).
Design System: Custom CSS tokens and rules will be refactored into Tailwind CSS v4 @theme & @layer components in
globals.css
following the Soft-Float UI guidelines (
docs/md_implimentations/second_design_principle.md
).
LLM & Backend Stubs: Server Route Handlers under app/api/ will be scaffolded as stubbed boundaries per
idea_scaffold.md
so the LLM provider layer remains 100% pluggable.
Proposed Changes
Feature-Driven Architecture Overview
Each feature domain is self-contained under features/<feature-name>/, containing its own components, state management (stores), domain types, and sub-views. Only genuinely shared design tokens and atomic UI primitives live in components/ui/.

text
src/ (or mhistree/)
├── app/ <-- Next.js App Router (Routes & Layouts)
│ ├── (patient)/ <-- Patient routes (/chat, /timeline, /health, /documents, /sharing, /profile, /settings)
│ ├── (clinician)/ <-- Clinician routes (/clinician/dashboard, /clinician/patients)
│ └── api/ <-- Route Handlers (AI Gateway, Timeline, Leases, Documents)
│
├── components/ui/ <-- Shared Generic Design System Primitives
│ ├── Icons.tsx
│ ├── Button.tsx
│ ├── Badge.tsx
│ ├── Avatar.tsx
│ ├── Card.tsx
│ ├── Switch.tsx
│ ├── VitalsChart.tsx
│ ├── QR.tsx
│ ├── Countdown.tsx
│ ├── Typewriter.tsx
│ ├── Toast.tsx
│ ├── Modal.tsx
│ └── Drawer.tsx
│
├── features/ <-- Feature Modules (Product Capabilities)
│ ├── shell/ <-- AppShell, Desktop Sidebar, Mobile TopBar, NavDrawer
│ ├── chat/ <-- ChatPage, MessageList, MessageBubble, MessageComposer, ChatStore
│ ├── timeline/ <-- TimelinePage, TimelineFilter, EpisodeCard, EventCard, EvidenceDrawer, CorrectionDialog, TimelineStore
│ ├── health/ <-- HealthPage, HealthHero, BaselineCard, VitalsCard, RecentActivityCard, HealthStore
│ ├── documents/ <-- DocumentsPage, DocumentGrid, DocumentCard, DocViewer, DocumentsStore
│ ├── sharing/ <-- SharingPage, LeaseCard, AccessHistoryCard, ShareWizard, LeaseDrawer, SharingStore
│ ├── profile/ <-- ProfilePage, ProfileHero, ProfileTabs, PersonalSummaryCard
│ ├── settings/ <-- SettingsPage, SettingsTabs, SettingsPanel, SettingsStore
│ ├── clinician/ <-- ClinDashboard, ClinPatients, ClinPatient, ClinicalBriefingCard, ActionConsole, ClinicianStore
│ └── ai/ <-- AIDrawer, CommandMenu, AI Gateway adapter stubs
│
└── stores/ <-- Global App Shell & Toast Store (useAppStore)

1. Global CSS & Design System
   [MODIFY]
   globals.css
   Add @import for Manrope font.
   Define light/dark mode CSS tokens (--stage, --shell, --card, --hero1, --hero2, --cta, --bl, --sh1, etc.).
   Convert prototype CSS rules into Tailwind @layer components (.btn, .card, .pill, .badge, .hero, .rail, .avatar, .drawer, .modal, .toast, .switch, etc.).
2. State Management Stores
   [NEW]
   useAppStore.ts
   Theme (light/dark), active role (patient | clinician), active drawer/modal states, toasts.
   [NEW]
   useChatStore.ts
   Sessions, active session, message threads, simulated AI typing & rules.
   [NEW]
   useHealthStore.ts
   Timeline events, episodes, medical baseline facts, document records, provenance tracking, verification/rejection/correction logic.
   [NEW]
   useSharingStore.ts
   Access leases, lease creation configuration, OTP/QR code state, lease revocation, access audit log.
   [NEW]
   useClinicianStore.ts
   Active clinician page, active patient, clinical notes, AI consultation feed, hypothesis verification queue.
3. Reusable UI Components (components/ui/)
   [NEW]
   Icons.tsx
   Modular SVG icon component (I) and brand logo component (
   Logo
   ).
   [NEW]
   Button.tsx
   Btn
   (primary dark, soft, small variants) and
   IconBtn
   (ghost, icon circle variants).
   [NEW]
   Badge.tsx
   Provenance badges (
   ProvBadge
   ), status badges (
   StatusBadge
   ), navigation badges (NavBadge), memory chips (MemChip).
   [NEW]
   Avatar.tsx
   Profile avatar with color ring and initials fallback, overlapping avatar rail (AvatarRail).
   [NEW]
   Card.tsx
   Soft-float Card,
   FactRow
   , MiniRow,
   Label
   .
   [NEW]
   Switch.tsx
   Accessible toggle switch.
   [NEW]
   VitalsChart.tsx
   Recharts AreaChart wrapper with gradient fill for resting heart rate trends.
   [NEW]
   QR.tsx
   Dynamic seed-based SVG QR code component for access OTP display.
   [NEW]
   Countdown.tsx
   Real-time lease expiration timer.
   [NEW]
   Typewriter.tsx
   Progressive streaming text animation (
   Type
   ).
   [NEW]
   Toast.tsx
   Animated toast notification container.
   [NEW]
   Modal.tsx
   &
   Drawer.tsx
   Framer Motion overlay panel primitives.
4. Overlays & Modals (components/modals/)
   [NEW] NavDrawer.tsx (Mobile ChatGPT-style left drawer)
   [NEW] EvidenceDrawer.tsx (Fact provenance & evidence drawer)
   [NEW] CorrectionDialog.tsx (Record correction modal)
   [NEW] ShareWizard.tsx (4-step access sharing modal)
   [NEW] LeaseDrawer.tsx (Lease detail & OTP QR view)
   [NEW] DocViewer.tsx (Document detail & AI extraction view)
   [NEW] AIDrawer.tsx (Contextual Ask Mhistree drawer)
   [NEW] CommandMenu.tsx (Cmd+K command palette)
5. Feature Components & Shell (components/features/)
   shell/: Sidebar.tsx, PatientSideContent.tsx, ClinSideContent.tsx, MobileTopBar.tsx, AppShell.tsx
   chat/: ChatHeader.tsx, MessageList.tsx, MessageBubble.tsx, MessageComposer.tsx
   timeline/: TimelineFilter.tsx, EpisodeCard.tsx, EventCard.tsx
   health/: HealthHero.tsx, MedicalBaselineCard.tsx, VitalsCard.tsx, RecentActivityCard.tsx, UpcomingCard.tsx
   documents/: DocumentCard.tsx, DocumentGrid.tsx
   sharing/: LeaseCard.tsx, AccessHistoryCard.tsx
   profile/: ProfileHero.tsx, ProfileTabs.tsx, PersonalSummaryCard.tsx
   settings/: SettingsNavigation.tsx, SettingsPanel.tsx
   clinician/: ClinicianHeader.tsx, ClinicalBriefingCard.tsx, ClinicalTimelineCard.tsx, ClinicalActionConsole.tsx
6. App Router Structure (app/)
   [NEW] app/layout.tsx (Root layout with global styles & fonts)
   [NEW] app/page.tsx (Entry point redirecting to /chat)
   Route group app/(patient):
   app/(patient)/layout.tsx
   app/(patient)/chat/page.tsx
   app/(patient)/timeline/page.tsx
   app/(patient)/health/page.tsx
   app/(patient)/documents/page.tsx
   app/(patient)/sharing/page.tsx
   app/(patient)/profile/page.tsx
   app/(patient)/settings/page.tsx
   Route group app/(clinician):
   app/(clinician)/layout.tsx
   app/(clinician)/dashboard/page.tsx
   app/(clinician)/patients/page.tsx
   app/(clinician)/patients/[patientId]/page.tsx
   AI Gateway & Service stubs:
   [NEW] app/api/ai/chat/route.ts
   [NEW] app/api/timeline/route.ts
   [NEW] app/api/leases/route.ts
   [NEW] app/api/documents/route.ts
   Verification Plan
   Automated Tests
   Validate TypeScript compilation (npm run build or npx tsc --noEmit).
   Verify next build succeeds cleanly without syntax or routing errors.
   Manual Verification
   Test patient navigation (/chat, /timeline, /health, /documents, /sharing, /profile, /settings).
   Test chat message sending, simulated system rule triggers, timeline event logging.
   Test evidence drawer opening from timeline event or chat system chip.
   Test document view drawer and mock upload workflow.
   Test 4-step share wizard, lease creation, QR/OTP code generation, and lease revocation.
   Test clinician workspace switching (/clinician/dashboard, /clinician/patients, /clinician/patients/p1), hypothesis verification queue, note authoring, and AI consultation feed.
   Test responsive mobile drawer and top bar layout.
