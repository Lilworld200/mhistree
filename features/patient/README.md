# Patient composition — T10–T18

Protected app/(patient) routes compose the existing shell with account, chat, documents, timeline, health, sharing, appointments, inbox and requests. Actual data comes from thin app/api transports and owning feature services; no synthetic records are seeded into ordinary views. Account operations are in account/server.ts; care providers/status projections are in care/server.ts. The former components/chat-foundation.tsx is retained reference, no longer the active chat.

Care screens use features/appointments and features/messaging; provider acceptance and result-production screens arrive in T23/T25. Unavailable actions and producer evidence are labeled. All access is server established through the T08/T09 session/context foundation. Read ../../docs/tasks/patient-phase-evidence.md for checks and open delivery/deployment gates.
