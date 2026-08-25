"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

/* ══════════════════════════════════════════════════════════════════
   MHISTREE — Longitudinal Health Companion (MVP Frontend)
   React + Zustand-style store + Framer Motion + Recharts
   Soft-Float UI · dark layered theme · auth gate popup + auth page
═══════════════════════════════════════════════════════════════════ */

/* ---------- tiny zustand-compatible store ---------- */
function createStore(init) {
  let state;
  const listeners = new Set();
  const api = {
    getState: () => state,
    setState: (p) => {
      const next = typeof p === 'function' ? p(state) : p;
      state = Object.assign({}, state, next);
      listeners.forEach((l) => l());
    },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
  state = init(api.setState, api.getState);
  return api;
}

/* ---------- icons ---------- */
const IC = {
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4',
  clip: 'M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  chev: 'M9 18l6-6-6-6',
  left: 'M15 18l-6-6 6-6',
  cal: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l4 2',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  spark: 'M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2zM19 17l.9 2.6L22 20l-2.1.6L19 23l-.9-2.4L16 20l2.1-.4z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 7H9',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  drop: 'M12 2.7s6 6.3 6 10.3a6 6 0 0 1-12 0c0-4 6-10.3 6-10.3z',
  thermo: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  edit: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  steth: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-1M20 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  menu: 'M3 6h18M3 12h18M3 18h18',
};
function I({ n, s = 18, w = 1.8, c = 'currentColor' }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={IC[n]} />
    </svg>
  );
}
const Logo = ({ s = 30 }) => (
  <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs><linearGradient id="lgx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#68A4FF" /><stop offset="1" stopColor="#2F74D8" /></linearGradient></defs>
    <rect x="1" y="1" width="30" height="30" rx="10" fill="url(#lgx)" />
    <path d="M16 25v-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 6c4 0 7 2.8 7 6.4 0 2.8-2.2 4.6-4.8 4.6h-4.4C11.2 17 9 15.2 9 12.4 9 8.8 12 6 16 6z" fill="#fff" />
    <path d="M12 25h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* ---------- avatars & mock data ---------- */
const AV = {
  nati: 'https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993/14d66c277-d123-4015-af6a-cea20297d767.png',
  amara: 'https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993/18a638ebf-1faa-4474-a4fa-c1da6ce0f3b9.png',
  tunde: 'https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993/17bcbaefa-7453-4711-b58e-09d279efd2c3.png',
  ifeoma: 'https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993/101a309b8-9e7a-47ab-98a5-94fd07ee0425.png',
  emeka: 'https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993/16ef61bdb-0088-477f-b537-cbab158f79ee.png',
};
const CARE_TEAM = [
  { name: 'Dr. Amara Okafor', role: 'GP · Central Clinic', img: AV.amara, ring: '#F4A8AC' },
  { name: 'Dr. Tunde Bakare', role: 'Cardiology', img: AV.tunde, ring: '#B7E4C7' },
  { name: 'Nurse Ifeoma', role: 'Care team', img: AV.ifeoma, ring: '#FBD9A0' },
  { name: 'Dr. Emeka Obi', role: 'Pulmonology', img: AV.emeka, ring: '#C7C6F2' },
];
const PROV = {
  self: { label: 'Patient reported', c: '#478BEE' },
  device: { label: 'Device', c: '#8A63D2' },
  lab: { label: 'Laboratory', c: '#2F8F5B' },
  clinician: { label: 'Clinician verified', c: '#55555A' },
  ai: { label: 'AI inferred', c: '#C08A2D' },
};
const STATUS_C = { verified: '#2F8F5B', reported: '#478BEE', inferred: '#C08A2D', corrected: '#C08A2D', disputed: '#CC5348', rejected: '#CC5348' };
const TYPE_META = {
  Symptom: { icon: 'thermo', c: '#478BEE' },
  Medication: { icon: 'cross', c: '#8A63D2' },
  Condition: { icon: 'heart', c: '#D96459' },
  Vital: { icon: 'pulse', c: '#2F8F5B' },
  Lab: { icon: 'drop', c: '#C08A2D' },
  Visit: { icon: 'cal', c: '#7A7A80' },
  Document: { icon: 'doc', c: '#8A8A90' },
};
const NEUTRAL_CHIP = { background: 'rgba(128,128,138,.16)', color: '#9A9AA0' };
const T0 = Date.now();
const seedEvents = [
  { id: 'e1', type: 'Symptom', title: 'Breathing difficulty', when: '19 Aug · 7:00 PM', ts: T0 - 86e6, desc: 'Breathing heavily for ~20 minutes after school practicals; skipped lunch.', src: 'self', status: 'reported', ep: 'ep1', session: 's1', sourceMsg: '“Today was exhausting… around 7pm I was breathing heavily for about 20 minutes.”' },
  { id: 'e2', type: 'Symptom', title: 'Evening wheeze after exertion', when: '17 Aug · 8:15 PM', ts: T0 - 259e6, desc: 'Wheeze noticed after evening football, resolved with rest.', src: 'self', status: 'reported', ep: 'ep1', session: 's3', sourceMsg: '“After football I could hear a slight wheeze in the evening.”' },
  { id: 'e3', type: 'Vital', title: 'Heart rate 118 bpm at rest', when: '19 Aug · 7:40 PM', ts: T0 - 84e6, desc: 'Wearable reading shortly after breathing episode.', src: 'device', status: 'reported', ep: 'ep1', sourceMsg: 'Wearable stream · HR 118 bpm (rest).' },
  { id: 'e4', type: 'Medication', title: 'Salbutamol inhaler started', when: '20 Aug · 9:00 AM', ts: T0 - 80e6, desc: '2 puffs as needed, before exertion. Prescribed at Central Clinic.', src: 'clinician', status: 'verified', verifiedBy: 'Dr. Amara Okafor', sourceMsg: 'Prescription record · Central Clinic.' },
  { id: 'e5', type: 'Lab', title: 'Full blood count — within range', when: '15 Aug', ts: T0 - 5e8, desc: 'No anemia or infection markers. Document linked.', src: 'lab', status: 'verified', docId: 'd1', sourceMsg: 'Lab document · Central Clinic pathology.' },
  { id: 'e6', type: 'Visit', title: 'GP consultation — Central Clinic', when: '07 Aug', ts: T0 - 12e8, desc: 'Reviewed exertional symptoms; spirometry requested.', src: 'clinician', status: 'verified', verifiedBy: 'Dr. Amara Okafor', sourceMsg: 'Encounter record · Central Clinic.' },
  { id: 'e7', type: 'Condition', title: 'Possible exercise-induced asthma', when: '20 Aug', ts: T0 - 79e6, desc: 'Pattern of evening wheeze + exertional breathlessness. Awaiting spirometry.', src: 'ai', status: 'inferred', support: 62, sourceMsg: 'Derived from e1, e2, e3 by extraction worker.' },
  { id: 'e8', type: 'Document', title: 'Discharge summary received', when: '04 Aug', ts: T0 - 15e8, desc: 'Observation stay after allergic reaction; resolved.', src: 'clinician', status: 'verified', docId: 'd3', sourceMsg: 'Document · Central Clinic records.' },
];
const EPISODES = [{ id: 'ep1', title: 'Respiratory symptoms', span: '17–21 Aug', count: 4, summary: 'Evening breathlessness and wheeze after exertion, one elevated resting HR reading, inhaler started. Trend: improving.' }];
const seedDocs = [
  { id: 'd1', name: 'Blood test — FBC', type: 'Lab result', date: '15 Aug 2026', facility: 'Central Clinic', extracted: ['Hb 13.8 g/dL — normal', 'WBC within range'], linked: ['e5'] },
  { id: 'd2', name: 'Prescription — Salbutamol', type: 'Prescription', date: '12 Aug 2026', facility: 'Central Clinic', extracted: ['Salbutamol 100mcg inhaler', '2 puffs PRN before exertion'], linked: ['e4'] },
  { id: 'd3', name: 'Discharge summary', type: 'Discharge', date: '04 Aug 2026', facility: 'Central Clinic', extracted: ['Allergic reaction — resolved', 'No respiratory sequelae'], linked: ['e8'] },
];
const seedSessions = [
  { id: 's1', title: 'Evening breathing check', group: 'Today' },
  { id: 's2', title: 'Exam stress & sleep', group: 'Yesterday' },
  { id: 's3', title: 'Headache after football', group: 'Previous 7 days' },
];
const seedMessages = {
  s1: [
    { id: 'm1', role: 'user', text: 'Today was exhausting. I had school practicals, skipped lunch, and around 7pm I was breathing heavily for about 20 minutes.' },
    { id: 'm2', role: 'sys', text: 'Saved to your health timeline · Breathing difficulty (reported)', evId: 'e1' },
    { id: 'm3', role: 'ai', text: 'That sounds like it came on pretty suddenly. You mentioned the breathing got heavy around 7pm and lasted about 20 minutes — is it completely gone now, or are you still feeling it?' },
  ],
  s2: [
    { id: 'm4', role: 'user', text: 'Exams are killing me, slept like 5 hours again 😅' },
    { id: 'm5', role: 'ai', text: 'Five hours during exam season is rough. I’ll keep the sleep pattern in mind — if it continues, it’s worth mentioning to your doctor, since poor sleep also makes breathing symptoms feel worse.' },
  ],
  s3: [
    { id: 'm6', role: 'user', text: 'Had a mild headache after football yesterday evening.' },
    { id: 'm7', role: 'sys', text: 'Saved to your health timeline · Headache (reported)', evId: 'e2' },
    { id: 'm8', role: 'ai', text: 'Noted. A mild headache after exertion is usually dehydration or heat — but I’ve linked it with your evening wheeze pattern so your clinician sees the whole picture.' },
  ],
};

/* ---------- store ---------- */
const store = createStore((set, get) => ({
  theme: 'dark', role: 'patient', page: 'chat', clinPage: 'dashboard', clinPatient: 'p1',
  drawer: false, authed: false, authOpen: false,
  sessions: seedSessions, activeSession: 's1', messages: seedMessages, typing: false,
  events: seedEvents, episodes: EPISODES, documents: seedDocs,
  leases: [{ id: 'L-2481', code: 'MH-482913', actor: 'Dr. Amara Okafor', org: 'Central Clinic', img: AV.amara, purpose: 'Consultation', scope: ['Health events', 'Medications', 'Labs', 'Vitals', 'Documents'], issuedAt: 'Today 2:09 PM', expiresAt: T0 + 26 * 60000, status: 'active' }],
  accessLog: [
    { actor: 'Dr. Amara Okafor', action: 'Redeemed lease · viewed Health Context', at: 'Today 2:09 PM', purpose: 'Consultation' },
    { actor: 'Nati', action: 'Created access lease L-2481', at: 'Today 2:08 PM', purpose: 'Consultation' },
  ],
  notes: [{ id: 'n1', text: 'Patient reports exertional symptoms; spirometry scheduled.', by: 'Dr. Amara Okafor', at: '07 Aug' }],
  evidenceId: null, correctionId: null, leaseView: null, wizard: false, cmd: false, aiDrawer: null, docView: null,
  toasts: [], tlType: 'All', tlSrc: 'All', profileTab: 'Overview', settingsTab: 'Account',
  prefs: { style: 'Concise', lang: 'English', voice: true, notif: true, reminders: true, shareAlerts: true, personalMem: true, healthMem: true },
}));
const useApp = (sel) => useSyncExternalStore(store.subscribe, () => sel(store.getState()), () => sel(store.getState()));
const S = () => store.getState();

let toastSeq = 0;
const act = {
  toast(text, icon = 'check') {
    const id = ++toastSeq;
    set2({ toasts: [...S().toasts, { id, text, icon }] });
    setTimeout(() => set2({ toasts: S().toasts.filter((t) => t.id !== id) }), 2800);
  },
  nav(page) { set2({ page, cmd: false, drawer: false }); },
  navClin(p) { set2({ clinPage: p, cmd: false, drawer: false }); },
  setRole(r) { set2({ role: r, cmd: false, drawer: false }); },
  openProfile() {
    if (S().authed) act.nav('profile');
    else set2({ authOpen: true, drawer: false, cmd: false });
  },
  signOut() {
    set2({ authed: false });
    act.toast('Signed out (demo)', 'out');
  },
  newChat() {
    const id = 's' + Date.now();
    set2({ sessions: [{ id, title: 'New conversation', group: 'Today' }, ...S().sessions], messages: { ...S().messages, [id]: [] }, activeSession: id, page: 'chat', drawer: false });
  },
  openSession(id) { set2({ activeSession: id, page: 'chat', drawer: false }); },
  send(text) {
    if (!text || !text.trim()) return;
    const sid = S().activeSession;
    pushMsg(sid, { id: 'm' + Date.now(), role: 'user', text });
    const sess = S().sessions.map((s) => (s.id === sid && s.title === 'New conversation' ? { ...s, title: text.slice(0, 26) } : s));
    set2({ sessions: sess, typing: true });
    setTimeout(() => {
      const rule = RULES.find((r) => r.re.test(text));
      if (rule) {
        const evId = 'e' + Date.now();
        const ev = { id: evId, type: rule.type, title: rule.title, when: 'Today · now', ts: Date.now(), desc: text, src: 'self', status: 'reported', session: sid, sourceMsg: '“' + text + '”' };
        set2({ events: [ev, ...S().events] });
        pushMsg(sid, { id: 'sy' + Date.now(), role: 'sys', text: 'Saved to your health timeline · ' + rule.title + ' (reported)', evId });
        const prior = S().events.find((e) => e.title === rule.title && e.id !== evId);
        pushMsg(sid, { id: 'ai' + Date.now(), role: 'ai', mem: !!prior, fresh: true, text: rule.reply(prior) });
      } else {
        pushMsg(sid, { id: 'ai' + Date.now(), role: 'ai', fresh: true, text: GENERIC[Math.floor(Math.random() * GENERIC.length)] });
      }
      set2({ typing: false });
    }, 1000);
  },
  verify(id) {
    set2({ events: S().events.map((e) => (e.id === id ? { ...e, status: 'verified', verifiedBy: 'Dr. Amara Okafor', verifiedAt: 'Today' } : e)) });
    log('Verified event · ' + evById(id)?.title);
    act.toast('Event verified · provenance recorded');
  },
  reject(id) {
    set2({ events: S().events.map((e) => (e.id === id ? { ...e, status: 'rejected' } : e)) });
    act.toast('Event rejected · original preserved', 'x');
  },
  dispute(id) {
    set2({ events: S().events.map((e) => (e.id === id ? { ...e, status: 'disputed' } : e)), evidenceId: null });
    act.toast('Marked as disputed · review requested', 'alert');
  },
  correct(id, note) {
    set2({
      events: S().events.map((e) => (e.id === id ? { ...e, status: 'corrected', corrections: [...(e.corrections || []), { note, at: 'Today' }] } : e)),
      correctionId: null, evidenceId: null,
    });
    act.toast('Correction received — original record preserved', 'edit');
  },
  createLease(cfg) {
    const code = 'MH-' + Math.floor(100000 + Math.random() * 899999);
    const lease = { id: 'L-' + Math.floor(1000 + Math.random() * 8999), code, actor: 'Dr. Amara Okafor', org: 'Central Clinic', img: AV.amara, purpose: cfg.purpose, scope: cfg.scope, issuedAt: 'Now', expiresAt: Date.now() + cfg.minutes * 60000, status: 'active' };
    set2({ leases: [lease, ...S().leases], wizard: false, leaseView: lease.id, accessLog: [{ actor: 'Nati', action: 'Created access lease ' + lease.id, at: 'Now', purpose: cfg.purpose }, ...S().accessLog] });
    act.toast('Access lease created · ' + cfg.minutes + ' min', 'shield');
  },
  revoke(id) {
    set2({ leases: S().leases.map((l) => (l.id === id ? { ...l, status: 'revoked' } : l)), leaseView: null, accessLog: [{ actor: 'Nati', action: 'Revoked lease ' + id, at: 'Now', purpose: 'Patient action' }, ...S().accessLog] });
    act.toast('Lease revoked · access blocked', 'lock');
  },
  upload() {
    const id = 'd' + Date.now();
    set2({ documents: [{ id, name: 'New upload — clinic receipt', type: 'Document', date: 'Today', facility: 'Pending sync', extracted: [], linked: [], processing: true }, ...S().documents] });
    act.toast('Upload received · processing', 'doc');
    setTimeout(() => {
      set2({ documents: S().documents.map((d) => (d.id === id ? { ...d, processing: false, extracted: ['Visit date captured', 'Facility: Central Clinic'] } : d)) });
      act.toast('Extraction complete · 2 facts linked', 'spark');
    }, 2200);
  },
  export() {
    const data = JSON.stringify({ profile: 'Nati Adeyemi', events: S().events, documents: S().documents.map((d) => d.name) }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'mhistree-health-history.json'; a.click();
    act.toast('Health history exported', 'download');
  },
  logAccess(action) { log(action); },
};
function set2(p) { store.setState(p); }
function pushMsg(sid, m) { const list = S().messages[sid] || []; set2({ messages: { ...S().messages, [sid]: [...list, m] } }); }
function log(action) { set2({ accessLog: [{ actor: 'Dr. Amara Okafor', action, at: 'Now', purpose: 'Consultation' }, ...S().accessLog] }); }
const evById = (id) => S().events.find((e) => e.id === id);

const RULES = [
  { re: /breath|wheeze|chest/i, type: 'Symptom', title: 'Breathing difficulty', reply: (p) => (p ? 'Last time you mentioned the breathlessness happened after exercise — was today similar? I’ve added this episode to your timeline so the pattern stays visible.' : 'That sounds uncomfortable. I’ve noted it in your health timeline so it isn’t lost. Is it completely gone now, or are you still feeling it?') },
  { re: /headache|migraine/i, type: 'Symptom', title: 'Headache', reply: () => 'Sorry about that. I’ve saved it with the time you mentioned. Did it start after activity, or more out of the blue?' },
  { re: /fever|temperature|hot flashes/i, type: 'Symptom', title: 'Feverish feeling', reply: () => 'Got it — I’ve logged it. Have you been able to measure your temperature, or is it more of a feeling?' },
  { re: /sleep|insomnia|tired/i, type: 'Symptom', title: 'Fatigue / sleep note', reply: () => 'That matters more than people think. I’ve kept it as a lifestyle note, not a medical fact. Want me to watch this pattern over the next few days?' },
];
const GENERIC = [
  'I hear you. I’ll keep that as personal context — it stays private unless you decide to share it.',
  'Thanks for sharing that with me. Nothing here needs a health entry, so it stays in our conversation only.',
  'Noted. If any of this turns into something health-related, I’ll ask before adding it to your timeline.',
];

/* ---------- primitives ---------- */
const Btn = ({ kind = 'soft', sm, icon, children, onClick, disabled, style, title }) => (
  <button title={title} disabled={disabled} style={style} className={`btn ${kind} ${sm ? 'sm' : ''}`} onClick={onClick}>
    {icon && <I n={icon} s={sm ? 15 : 17} />}
    {children}
  </button>
);
const IconBtn = ({ icon, onClick, size = 46, title, ghost }) => (
  <button title={title} className={`btn icon ${ghost ? 'ghost' : ''}`} style={{ width: size, height: size }} onClick={onClick}>
    <I n={icon} s={size * 0.42} />
  </button>
);
const ProvBadge = ({ src }) => (
  <span className="badge"><i className="dot" style={{ background: PROV[src]?.c }} />{PROV[src]?.label}</span>
);
const StatusBadge = ({ st }) => (
  <span className="badge" style={{ color: STATUS_C[st] }}><i className="dot" style={{ background: STATUS_C[st] }} />{st[0].toUpperCase() + st.slice(1)}</span>
);
const Avatar = ({ img, ring = '#C7C6F2', size = 44, name = '?' }) => (
  img ? <img className="av" style={{ width: size, height: size, boxShadow: `0 5px 12px rgba(0,0,0,.12), 0 0 0 3px ${ring} inset` }} src={img} alt={name} />
    : <span className="av init" style={{ width: size, height: size, background: ring }}>{name[0]}</span>
);
const Label = ({ children, right }) => (
  <div className="labrow"><span className="mlabel">{children}</span>{right}</div>
);
const Switch = ({ on, onChange }) => (
  <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}><i /></button>
);
const Reveal = ({ children, d = 0, className }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.5, delay: d, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </motion.div>
);
const Type = ({ text, on }) => {
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => { if (!on || n >= text.length) return; const t = setTimeout(() => setN(n + 3), 16); return () => clearTimeout(t); }, [n, on, text]);
  return <>{text.slice(0, n)}{n < text.length && <span className="caret">▍</span>}</>;
};
function Countdown({ exp, prefix = 'Expires in ' }) {
  const [left, setLeft] = useState(exp - Date.now());
  useEffect(() => { const t = setInterval(() => setLeft(exp - Date.now()), 1000); return () => clearInterval(t); }, [exp]);
  const s = Math.max(0, Math.floor(left / 1000));
  if (left <= 0) return <span style={{ color: 'var(--red)' }}>Expired</span>;
  return <>{prefix}{Math.floor(s / 60)}m {s % 60}s</>;
}
function QR({ seed, size = 128 }) {
  const rects = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967295; };
    const out = [];
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      const fz = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (!fz && rnd() > 0.52) out.push([x, y]);
    }
    return out;
  }, [seed]);
  const F = ({ x, y }) => (
    <g transform={`translate(${x},${y})`}>
      <path d="M0 0h7v7H0z M1 1h5v5H1z" fill="#111" fillRule="evenodd" />
      <rect x="2" y="2" width="3" height="3" fill="#111" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" width={size} height={size} style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,.08)' }}>
      {rects.map(([x, y], i2) => <rect key={i2} x={x} y={y} width="1" height="1" fill="#111" />)}
      <F x={0} y={0} /><F x={14} y={0} /><F x={0} y={14} />
    </svg>
  );
}
const Drawer = ({ open, onClose, children, wide }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.aside className="drawer" style={wide ? { width: 'min(520px,94vw)' } : undefined} initial={{ x: '110%' }} animate={{ x: 0 }} exit={{ x: '110%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
          {children}
        </motion.aside>
      </>
    )}
  </AnimatePresence>
);
const Modal = ({ open, onClose, children, w = 560 }) => (
  <AnimatePresence>
    {open && (
      <motion.div className="scrim modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="panel" style={{ width: `min(${w}px, 94vw)` }} initial={{ opacity: 0, scale: 0.94, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ type: 'spring', damping: 26, stiffness: 320 }} onClick={(e) => e.stopPropagation()}>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
const Toasts = () => {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className="toast" initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}>
            <I n={t.icon} s={15} c="#7FB5FF" />{t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/* ═════════════ AUTH GATE POPUP ═════════════ */
function AuthGate() {
  const open = useApp((s) => s.authOpen);
  return (
    <Modal open={open} onClose={() => set2({ authOpen: false })} w={420}>
      <div className="dhead" style={{ padding: 0, marginBottom: 10 }}>
        <span className="hpill dark"><I n="lock" s={13} />Profile locked</span>
        <IconBtn ghost icon="x" size={36} onClick={() => set2({ authOpen: false })} />
      </div>
      <div className="gatelock"><I n="lock" s={22} /></div>
      <b className="ptitle sm" style={{ display: 'block', textAlign: 'center' }}>Sign in to view your profile</b>
      <p className="small" style={{ textAlign: 'center', margin: '8px 0 16px' }}>
        Your identity, medical baseline, allergies and care team live here.
        This page opens only after authentication — it takes a few seconds.
      </p>
      <Btn kind="dark" icon="user" style={{ width: '100%' }} onClick={() => set2({ authOpen: false, page: 'auth' })}>Sign in</Btn>
      <button className="link" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => set2({ authOpen: false })}>Not now</button>
    </Modal>
  );
}

/* ═════════════ AUTH PAGE (sign in / sign up, fluid scroll toggle) ═════════════ */
function AuthPage() {
  const [mode, setMode] = useState('in');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', email: '', pass: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!f.email.trim() || !f.pass.trim() || (mode === 'up' && !f.name.trim())) { act.toast('Fill in the required fields', 'alert'); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      set2({ authed: true, page: 'profile', authOpen: false });
      act.toast(mode === 'up' ? 'Account created — welcome to Mhistree' : 'Welcome back, Nati');
    }, 900);
  };
  return (
    <motion.div className="authstage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="authback" onClick={() => act.nav('chat')}><I n="left" s={17} />Back</button>
      <motion.div className="authshell" initial={{ opacity: 0, y: 22, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 26, stiffness: 260 }}>
        <div className="authbrand"><Logo s={40} /></div>
        <h1 className="display sm">Your health, remembered.</h1>
        <p className="esub" style={{ margin: '0 0 6px' }}>Talk naturally. Mhistree keeps what matters — and only you decide who sees it.</p>
        {/* fluid segmented toggle */}
        <div className="authseg" role="tablist">
          <motion.span className="thumb" animate={{ x: mode === 'in' ? '0%' : '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} />
          <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
          <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
        </div>
        {/* fluid scroll form switcher */}
        <div className="authscroll">
          <motion.div className="authtrack" animate={{ x: mode === 'in' ? '0%' : '-50%' }} transition={{ type: 'spring', damping: 30, stiffness: 240 }}>
            <form className="authpanel" onSubmit={submit}>
              <label className="flabel">Email</label>
              <input className="cinput" type="email" placeholder="you@example.com" value={f.email} onChange={set('email')} />
              <label className="flabel">Password</label>
              <input className="cinput" type="password" placeholder="••••••••" value={f.pass} onChange={set('pass')} />
              <Btn kind="dark" style={{ width: '100%', marginTop: 6 }} onClick={() => { }}>
                {busy && mode === 'in' ? <span className="spin" /> : <I n="out" s={16} />}Sign in
              </Btn>
              <button type="button" className="link" style={{ margin: '2px auto 0' }} onClick={() => act.toast('Reset link sent (demo)', 'lock')}>Forgot password?</button>
            </form>
            <form className="authpanel" onSubmit={submit}>
              <label className="flabel">Full name</label>
              <input className="cinput" placeholder="Nati Adeyemi" value={f.name} onChange={set('name')} />
              <label className="flabel">Email</label>
              <input className="cinput" type="email" placeholder="you@example.com" value={f.email} onChange={set('email')} />
              <label className="flabel">Password</label>
              <input className="cinput" type="password" placeholder="Create a password" value={f.pass} onChange={set('pass')} />
              <Btn kind="dark" style={{ width: '100%', marginTop: 6 }}>
                {busy && mode === 'up' ? <span className="spin" /> : <I n="plus" s={16} />}Create account
              </Btn>
            </form>
          </motion.div>
        </div>
        <p className="small authnote"><I n="shield" s={13} />Your diary stays private. Clinicians only see what you lease. <span className="authdemo">Demo: any email & password work.</span></p>
      </motion.div>
    </motion.div>
  );
}

/* ═════════════ SHARED SIDEBAR CONTENT ═════════════ */
const NAV = [
  { id: 'chat', icon: 'chat', label: 'AI' },
  { id: 'timeline', icon: 'pulse', label: 'Timeline' },
  { id: 'health', icon: 'heart', label: 'Health' },
  { id: 'documents', icon: 'doc', label: 'Documents' },
  { id: 'sharing', icon: 'share', label: 'Sharing' },
];
function PatientSideContent({ onClose }) {
  const page = useApp((s) => s.page);
  const sessions = useApp((s) => s.sessions);
  const active = useApp((s) => s.activeSession);
  const authed = useApp((s) => s.authed);
  const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Previous month'];
  return (
    <>
      <div className="brand"><Logo /><span>Mhistree</span>
        {onClose && <button className="dx" onClick={onClose} aria-label="Close menu"><I n="x" s={16} /></button>}
      </div>
      <Btn kind="dark" icon="plus" onClick={act.newChat} style={{ width: '100%', marginBottom: 14 }}>New chat</Btn>
      {NAV.map((nv) => (
        <button key={nv.id} className={`nav ${page === nv.id ? 'on' : ''}`} onClick={() => act.nav(nv.id)}>
          <I n={nv.icon} s={17} />{nv.label}
        </button>
      ))}
      <button className={`nav ${page === 'profile' ? 'on' : ''}`} onClick={act.openProfile}>
        <I n="user" s={17} />Profile{!authed && <I n="lock" s={13} />}
      </button>
      <div className="mlabel" style={{ margin: '14px 14px 6px' }}>RECENT CONVERSATIONS</div>
      <div className="recents">
        {groups.map((g) => {
          const list = sessions.filter((s) => s.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="glabel">{g}</div>
              {list.map((s) => (
                <button key={s.id} className={`nav recent ${active === s.id && page === 'chat' ? 'on' : ''}`} onClick={() => act.openSession(s.id)}>
                  <I n="chat" s={14} /><span className="ell">{s.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="sidefoot">
        <button className="nav" onClick={() => act.setRole('clinician')}><I n="steth" s={17} />Clinician workspace</button>
        <button className="nav" onClick={() => act.nav('settings')}><I n="gear" s={17} />Settings</button>
        <button className="nav" onClick={() => act.toast('Support: care@mhistree.app · replies < 24h', 'chat')}><I n="chat" s={17} />Help</button>
        <button className="nav" onClick={act.signOut}><I n="out" s={17} />Sign out</button>
        <div className="prow" onClick={act.openProfile}>
          <Avatar img={AV.nati} ring="#F4A8AC" size={36} name="Nati" />
          <div className="pmeta"><b>Nati Adeyemi</b><span>{authed ? 'Patient · O+' : 'Not signed in'}</span></div>
          {authed ? <I n="chev" s={16} /> : <I n="lock" s={14} />}
        </div>
      </div>
    </>
  );
}
function ClinSideContent({ onClose }) {
  const cp = useApp((s) => s.clinPage);
  return (
    <>
      <div className="brand"><Logo /><span>Mhistree<b className="clinlab">Clinical</b></span>
        {onClose && <button className="dx" onClick={onClose} aria-label="Close menu"><I n="x" s={16} /></button>}
      </div>
      {[{ id: 'dashboard', icon: 'pulse', label: 'Dashboard' }, { id: 'patients', icon: 'user', label: 'Patients' }].map((nv) => (
        <button key={nv.id} className={`nav ${cp === nv.id ? 'on' : ''}`} onClick={() => act.navClin(nv.id)}><I n={nv.icon} s={17} />{nv.label}</button>
      ))}
      <button className="nav" onClick={() => { act.navClin('dashboard'); act.toast('2 alerts need review', 'alert'); }}><I n="alert" s={17} />Alerts<span className="navbadge">2</span></button>
      <div className="mlabel" style={{ margin: '14px 14px 6px' }}>ACTIVE LEASES</div>
      <button className="nav recent on" onClick={() => act.navClin('patient')}><Avatar img={AV.nati} ring="#F4A8AC" size={24} name="N" /><span className="ell">Nati Adeyemi</span></button>
      <div className="sidefoot">
        <button className="nav" onClick={() => act.setRole('patient')}><I n="out" s={17} />Back to patient app</button>
        <button className="nav" onClick={() => act.toast('Support: clinical@mhistree.app', 'chat')}><I n="chat" s={17} />Help</button>
        <div className="prow"><Avatar img={AV.amara} ring="#F4A8AC" size={36} name="A" /><div className="pmeta"><b>Dr. Amara Okafor</b><span>GP · Central Clinic</span></div></div>
      </div>
    </>
  );
}
function Sidebar() {
  const role = useApp((s) => s.role);
  return <aside className="side">{role === 'patient' ? <PatientSideContent /> : <ClinSideContent />}</aside>;
}

/* ═════════════ MOBILE TOP BAR + DRAWER ═════════════ */
const PAGE_TITLES = { chat: 'Mhistree', timeline: 'Timeline', health: 'Health', documents: 'Documents', sharing: 'Sharing', profile: 'Profile', settings: 'Settings' };
const C_TITLES = { dashboard: 'Dashboard', patients: 'Patients', patient: 'Patient record' };
function MobileTopBar() {
  const role = useApp((s) => s.role);
  const page = useApp((s) => s.page);
  const cp = useApp((s) => s.clinPage);
  const title = role === 'patient' ? PAGE_TITLES[page] || 'Mhistree' : C_TITLES[cp] || 'Clinical';
  const action = role === 'patient'
    ? ({
      chat: { i: 'plus', f: act.newChat, t: 'New chat' },
      timeline: { i: 'search', f: () => set2({ cmd: true }), t: 'Search history' },
      health: { i: 'spark', f: () => set2({ aiDrawer: { context: 'health' } }), t: 'Ask Mhistree' },
      documents: { i: 'up', f: act.upload, t: 'Upload document' },
      sharing: { i: 'plus', f: () => set2({ wizard: true }), t: 'Share health information' },
      profile: { i: 'gear', f: () => act.nav('settings'), t: 'Settings' },
      settings: { i: 'chev', f: () => act.nav('chat'), t: 'Back to chat' },
    })[page]
    : ({
      dashboard: { i: 'bell', f: () => act.toast('2 alerts need review', 'alert'), t: 'Alerts' },
      patients: { i: 'search', f: () => set2({ cmd: true }), t: 'Search' },
      patient: { i: 'spark', f: () => set2({ aiDrawer: { context: 'patient' } }), t: 'Clinical AI' },
    })[cp];
  return (
    <div className="topbar">
      <IconBtn icon="menu" size={40} title="Open menu" onClick={() => set2({ drawer: true })} />
      <span className="tbtitle">{title}</span>
      {action ? <IconBtn icon={action.i} size={40} title={action.t} onClick={action.f} /> : <span style={{ width: 40 }} />}
    </div>
  );
}
function NavDrawer() {
  const open = useApp((s) => s.drawer);
  const role = useApp((s) => s.role);
  const close = () => set2({ drawer: false });
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim scrimside" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside className="drawer-left" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 32, stiffness: 300 }}>
            {role === 'patient' ? <PatientSideContent onClose={close} /> : <ClinSideContent onClose={close} />}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ═════════════ CHAT PAGE ═════════════ */
function ChatPage() {
  const sessions = useApp((s) => s.sessions);
  const active = useApp((s) => s.activeSession);
  const msgs = useApp((s) => s.messages[s.activeSession]) || [];
  const typing = useApp((s) => s.typing);
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const session = sessions.find((s) => s.id === active);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, typing]);
  const submit = (e) => { e.preventDefault(); act.send(text); setText(''); };
  return (
    <div className="pagecol">
      <header className="chead">
        <div>
          <div className="ctitle">{session?.title || 'Conversation'}</div>
          <div className="csub">New session · continuity from long-term memory</div>
        </div>
        <span className="hpill dark"><I n="shield" s={13} />Health context on</span>
        <IconBtn ghost icon="bell" size={40} onClick={() => act.toast('No new notifications', 'bell')} />
      </header>
      <div className="msgs" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="empty">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Logo s={44} />
              <h1 className="display sm">How can I help with<br />your health today?</h1>
              <p className="esub">Tell me what you’re experiencing, ask about your health history, or just talk normally.</p>
              <div className="qrow">
                <Btn kind="soft" sm icon="chat" onClick={() => act.send('I feel a bit tired and had a headache since evening')}>Describe how you feel</Btn>
                <Btn kind="soft" sm icon="heart" onClick={() => act.nav('health')}>Review my health</Btn>
                <Btn kind="soft" sm icon="doc" onClick={() => act.nav('documents')}>Add a document</Btn>
              </div>
            </motion.div>
          </div>
        )}
        {msgs.map((m, i2) => <Bubble key={m.id} m={m} last={i2 === msgs.length - 1} />)}
        {typing && (
          <div className="brow ai"><span className="aav"><Logo s={22} /></span>
            <div className="bubble"><span className="tdots"><i /><i /><i /></span></div>
          </div>
        )}
      </div>
      <form className="composer" onSubmit={submit}>
        <IconBtn icon="clip" size={44} title="Attach" onClick={() => act.nav('documents')} />
        <IconBtn icon="mic" size={44} title="Voice" onClick={() => act.toast('Voice input arrives after MVP', 'mic')} />
        <input className="cinput" placeholder="Message Mhistree…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn dark send" type="submit" aria-label="Send"><I n="up" s={17} /></button>
      </form>
    </div>
  );
}
function Bubble({ m, last }) {
  if (m.role === 'sys') {
    return (
      <motion.div className="sysrow" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <button className="syschip" onClick={() => m.evId && set2({ evidenceId: m.evId })}>
          <I n="plus" s={13} c="#2F8F5B" />{m.text}<I n="chev" s={13} />
        </button>
      </motion.div>
    );
  }
  if (m.role === 'user') {
    return (
      <motion.div className="brow user" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="bubble userb">{m.text}</div>
      </motion.div>
    );
  }
  return (
    <motion.div className="brow ai" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <span className="aav"><Logo s={22} /></span>
      <div className="bubble">
        {m.mem && <span className="memchip"><I n="spark" s={12} />Using your health history</span>}
        <p><Type text={m.text} on={m.fresh && last} /></p>
        <div className="macts">
          <button onClick={() => act.toast('Copied to clipboard', 'check')}>Copy</button>
          <button onClick={() => act.toast('Reading aloud… (demo)', 'mic')}>Listen</button>
          <button onClick={() => set2({ aiDrawer: { context: 'conversation' } })}>View evidence</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═════════════ TIMELINE PAGE ═════════════ */
const TL_TYPES = ['All', 'Symptoms', 'Medications', 'Conditions', 'Vitals', 'Labs', 'Visits', 'Documents'];
const TL_SRCS = ['All', 'Reported by me', 'Clinician verified', 'Laboratory', 'Device', 'AI inferred'];
const srcMatch = (ev, f) =>
  f === 'All' || (f === 'Reported by me' && ev.src === 'self') || (f === 'Clinician verified' && ev.src === 'clinician') ||
  (f === 'Laboratory' && ev.src === 'lab') || (f === 'Device' && ev.src === 'device') || (f === 'AI inferred' && ev.src === 'ai');
function TimelinePage() {
  const events = useApp((s) => s.events);
  const tlType = useApp((s) => s.tlType);
  const tlSrc = useApp((s) => s.tlSrc);
  const [q, setQ] = useState('');
  const [epOpen, setEpOpen] = useState(false);
  const typeMatch = (ev) => tlType === 'All' || (tlType === 'Symptoms' && ev.type === 'Symptom') || (tlType === 'Medications' && ev.type === 'Medication') || (tlType === 'Conditions' && ev.type === 'Condition') || (tlType === 'Vitals' && ev.type === 'Vital') || (tlType === 'Labs' && ev.type === 'Lab') || (tlType === 'Visits' && ev.type === 'Visit') || (tlType === 'Documents' && ev.type === 'Document');
  const list = events.filter((e) => typeMatch(e) && srcMatch(e, tlSrc) && e.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="scroll">
      <div className="phead">
        <div><h1 className="ptitle">Health Timeline</h1><p className="psub">Your longitudinal record · every fact keeps its source</p></div>
        <div className="searchpill"><I n="search" s={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" /></div>
      </div>
      <div className="pills">{TL_TYPES.map((t) => <button key={t} className={`pill ${tlType === t ? 'on' : ''}`} onClick={() => set2({ tlType: t })}>{t}</button>)}</div>
      <div className="pills sub">{TL_SRCS.map((t) => <button key={t} className={`pill tiny ${tlSrc === t ? 'on' : ''}`} onClick={() => set2({ tlSrc: t })}>{t}</button>)}</div>
      {tlType === 'All' && tlSrc === 'All' && (
        <Reveal>
          <button className="card epcard" onClick={() => setEpOpen(!epOpen)}>
            <div className="epic"><I n="pulse" s={18} c="#478BEE" /></div>
            <div className="eptxt">
              <b>Respiratory symptoms</b>
              <span>17–21 Aug · 4 events · improving</span>
            </div>
            <span className="hpill dark">Episode</span>
            <motion.span animate={{ rotate: epOpen ? 90 : 0 }}><I n="chev" s={16} /></motion.span>
          </button>
          <AnimatePresence>
            {epOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div className="card inset" style={{ margin: '0 0 18px', padding: 16 }}>
                  <p className="small">{EPISODES[0].summary}</p>
                  <div className="qchips">{['e1', 'e2', 'e3', 'e4'].map((id) => <button key={id} className="pill tiny on" onClick={() => set2({ evidenceId: id })}>{evById(id)?.title}</button>)}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Reveal>
      )}
      <div className="mlabel" style={{ margin: '6px 4px 12px' }}>AUGUST 2026</div>
      <div className="tl">
        {list.map((ev, i2) => (
          <Reveal key={ev.id} d={Math.min(i2 * 0.04, 0.2)}>
            <button className="card evcard" onClick={() => set2({ evidenceId: ev.id })}>
              <span className="tic" style={{ background: (TYPE_META[ev.type]?.c || '#888') + '26', color: TYPE_META[ev.type]?.c }}><I n={TYPE_META[ev.type]?.icon || 'pulse'} s={17} /></span>
              <span className="evmain">
                <b>{ev.title}</b>
                <span className="evwhen">{ev.when}</span>
                <span className="evdesc ell2">{ev.desc}</span>
                <span className="evbadges"><ProvBadge src={ev.src} /><StatusBadge st={ev.status} /></span>
              </span>
              <I n="chev" s={16} />
            </button>
          </Reveal>
        ))}
        {list.length === 0 && <div className="card inset small" style={{ padding: 22, textAlign: 'center', color: 'var(--ink2)' }}>No events match these filters.</div>}
      </div>
    </div>
  );
}

/* ═════════════ HEALTH PAGE ═════════════ */
const HR_DATA = [{ v: 72 }, { v: 76 }, { v: 74 }, { v: 81 }, { v: 96 }, { v: 118 }, { v: 88 }, { v: 79 }];
function HealthPage() {
  const events = useApp((s) => s.events);
  const recent = events.slice(0, 3);
  return (
    <div className="scroll">
      <Reveal>
        <div className="hero">
          <div className="hrow">
            <span className="hid"><Avatar img={AV.nati} ring="#F4A8AC" size={30} name="N" /><b>Nati</b></span>
            <button className="hutil" onClick={() => act.toast('Reminders are on', 'bell')}><I n="bell" s={16} /></button>
          </div>
          <div className="hcenter">
            <span className="hpill">Today’s health</span>
            <motion.div className="display" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>82</motion.div>
            <span className="hsub">Good — steady week · 1 open thread</span>
          </div>
        </div>
        <div className="rail">
          {CARE_TEAM.map((c, i2) => (
            <motion.span key={c.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i2 * 0.07 }} title={c.name}>
              <Avatar img={c.img} ring={c.ring} size={52} name={c.name} />
            </motion.span>
          ))}
        </div>
      </Reveal>
      <Reveal d={0.08}>
        <div className="actrow">
          <IconBtn icon="spark" title="Ask Mhistree" onClick={() => set2({ aiDrawer: { context: 'health' } })} />
          <IconBtn icon="doc" title="Documents" onClick={() => act.nav('documents')} />
          <Btn kind="soft" onClick={() => set2({ aiDrawer: { context: 'health' } })}>Review plan</Btn>
          <Btn kind="dark" icon="up" onClick={() => { act.newChat(); setTimeout(() => act.send('Starting my daily check-in — overall I feel okay, a bit tired.'), 150); }}>Start check-in</Btn>
        </div>
      </Reveal>
      <div className="grid2">
        <Reveal d={0.05}><div className="card">
          <Label right={<button className="link" onClick={act.openProfile}>View all</button>}>Medical baseline</Label>
          <FactRow k="Allergy" v="Penicillin" src="clinician" />
          <FactRow k="Condition" v="Asthma — provisional" src="ai" />
          <FactRow k="Medication" v="Salbutamol inhaler PRN" src="clinician" />
          <FactRow k="Blood group" v="O+" src="self" />
        </div></Reveal>
        <Reveal d={0.1}><div className="card">
          <Label right={<span className="badge"><i className="dot" style={{ background: '#8A63D2' }} />Device</span>}>Resting heart rate</Label>
          <div className="vitalhead"><b className="vnum">79</b><span className="small">bpm · latest</span><span className="badge" style={{ color: 'var(--amber)' }}><i className="dot" style={{ background: 'var(--amber)' }} />1 spike this week</span></div>
          <div style={{ height: 74, marginTop: 6 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HR_DATA}>
                <defs><linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#478BEE" stopOpacity={0.35} /><stop offset="100%" stopColor="#478BEE" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="v" stroke="#478BEE" strokeWidth={2.4} fill="url(#hrg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div></Reveal>
        <Reveal d={0.15}><div className="card">
          <Label right={<button className="link" onClick={() => act.nav('timeline')}>Open timeline</button>}>Recent activity</Label>
          {recent.map((ev) => (
            <button key={ev.id} className="minirow" onClick={() => set2({ evidenceId: ev.id })}>
              <span className="tic sm" style={{ background: (TYPE_META[ev.type]?.c || '#888') + '26', color: TYPE_META[ev.type]?.c }}><I n={TYPE_META[ev.type]?.icon} s={14} /></span>
              <span className="ell"><b>{ev.title}</b><span className="small block">{ev.when}</span></span>
              <StatusBadge st={ev.status} />
            </button>
          ))}
        </div></Reveal>
        <Reveal d={0.2}><div className="card">
          <Label>Upcoming</Label>
          <div className="minirow"><span className="tic sm" style={NEUTRAL_CHIP}><I n="cal" s={14} /></span>
            <span><b>Spirometry — Central Clinic</b><span className="small block">28 Aug · 10:30 AM · Dr. Emeka Obi</span></span>
          </div>
          <div className="minirow"><span className="tic sm" style={{ background: '#478BEE26', color: '#478BEE' }}><I n="chat" s={14} /></span>
            <span><b>Weekly reflection</b><span className="small block">Mhistree will summarise your week on Sunday</span></span>
          </div>
        </div></Reveal>
      </div>
    </div>
  );
}
const FactRow = ({ k, v, src }) => (
  <div className="factrow"><span className="small">{k}</span><b className="ell">{v}</b><ProvBadge src={src} /></div>
);

/* ═════════════ DOCUMENTS PAGE ═════════════ */
function DocumentsPage() {
  const docs = useApp((s) => s.documents);
  return (
    <div className="scroll">
      <div className="phead">
        <div><h1 className="ptitle">Documents</h1><p className="psub">Labs, prescriptions and reports — evidence behind your timeline</p></div>
        <Btn kind="dark" icon="up" onClick={act.upload}>Upload document</Btn>
      </div>
      <div className="grid3">
        {docs.map((d, i2) => (
          <Reveal key={d.id} d={i2 * 0.05}>
            <button className="card doccard" onClick={() => set2({ docView: d.id })}>
              <span className="tic" style={{ background: '#C08A2D26', color: '#C08A2D' }}><I n="doc" s={18} /></span>
              <span className="evmain"><b>{d.name}</b><span className="evwhen">{d.type} · {d.date}</span>
                <span className="evbadges">{d.processing ? <span className="badge" style={{ color: 'var(--amber)' }}><i className="dot" style={{ background: 'var(--amber)' }} />Processing</span> : <span className="badge" style={{ color: 'var(--green)' }}><i className="dot" style={{ background: 'var(--green)' }} />Processed</span>}</span>
              </span>
              <I n="chev" s={16} />
            </button>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
function DocViewer() {
  const docView = useApp((s) => s.docView);
  const doc = S().documents.find((d) => d.id === docView);
  return (
    <Drawer open={!!docView} onClose={() => set2({ docView: null })}>
      {doc && (
        <>
          <div className="dhead"><b className="ptitle sm">{doc.name}</b><IconBtn ghost icon="x" size={36} onClick={() => set2({ docView: null })} /></div>
          <div className="scroll" style={{ padding: '0 22px 22px' }}>
            <div className="preview"><div className="pvline w60" /><div className="pvline" /><div className="pvline" /><div className="pvline w80" /><div className="pvline w40" /></div>
            <Label>Metadata</Label>
            <div className="kv"><span>Type</span><b>{doc.type}</b></div>
            <div className="kv"><span>Facility</span><b>{doc.facility}</b></div>
            <div className="kv"><span>Date</span><b>{doc.date}</b></div>
            <div className="kv"><span>Source</span><b>Uploaded by patient</b></div>
            <Label right={<I n="spark" s={14} c="#C08A2D" />}>AI extraction</Label>
            {doc.processing ? <p className="small">Extraction pending — the source document is already preserved.</p> :
              doc.extracted.map((x) => <div key={x} className="kv"><I n="check" s={14} c="#2F8F5B" /><b>{x}</b></div>)}
            <Label>Linked health events</Label>
            <div className="qchips">{doc.linked.map((id) => <button key={id} className="pill tiny on" onClick={() => set2({ docView: null, evidenceId: id })}>{evById(id)?.title || id}</button>)}</div>
            <div className="actrow" style={{ marginTop: 16 }}>
              <Btn kind="soft" sm icon="spark" onClick={() => set2({ docView: null, aiDrawer: { context: 'document' } })}>Ask Mhistree</Btn>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ═════════════ SHARING PAGE ═════════════ */
function SharingPage() {
  const leases = useApp((s) => s.leases);
  const accessLog = useApp((s) => s.accessLog);
  return (
    <div className="scroll">
      <div className="phead">
        <div><h1 className="ptitle">Health Access</h1><p className="psub">You decide who sees your Health Context — and for how long</p></div>
        <Btn kind="dark" icon="plus" onClick={() => set2({ wizard: true })}>Share health information</Btn>
      </div>
      <div className="grid2">
        {leases.map((l, i2) => (
          <Reveal key={l.id} d={i2 * 0.06}>
            <div className="card">
              <div className="leasetop">
                <Avatar img={l.img} ring="#B7E4C7" size={44} name={l.actor} />
                <div><b>{l.actor}</b><span className="small block">{l.org}</span></div>
                <span className="badge" style={l.status === 'active' ? { color: 'var(--green)' } : { color: 'var(--red)' }}>
                  <i className="dot" style={{ background: l.status === 'active' ? 'var(--green)' : 'var(--red)' }} />{l.status[0].toUpperCase() + l.status.slice(1)}
                </span>
              </div>
              <div className="kv"><span>Purpose</span><b>{l.purpose}</b></div>
              <div className="kv"><span>Access</span><b>Health Context only</b></div>
              <div className="kv"><span>Window</span><b>{l.status === 'active' ? <Countdown exp={l.expiresAt} /> : l.status}</b></div>
              <div className="qchips">{l.scope.map((sc) => <span key={sc} className="pill tiny">{sc}</span>)}</div>
              <div className="actrow" style={{ marginTop: 14 }}>
                <Btn kind="soft" sm icon="eye" onClick={() => set2({ leaseView: l.id })}>View</Btn>
                {l.status === 'active' && <Btn kind="soft" sm icon="lock" onClick={() => act.revoke(l.id)}>Revoke</Btn>}
              </div>
            </div>
          </Reveal>
        ))}
        <Reveal d={0.12}>
          <div className="card">
            <Label>Access history</Label>
            {accessLog.slice(0, 6).map((a, i2) => (
              <div key={i2} className="minirow"><span className="tic sm" style={{ background: '#2F8F5B26', color: '#2F8F5B' }}><I n="shield" s={14} /></span>
                <span><b>{a.actor}</b> <span className="small">{a.action}</span><span className="small block">{a.at} · {a.purpose}</span></span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
function LeaseDrawer() {
  const leaseView = useApp((s) => s.leaseView);
  const l = S().leases.find((x) => x.id === leaseView);
  return (
    <Drawer open={!!leaseView} onClose={() => set2({ leaseView: null })}>
      {l && (
        <>
          <div className="dhead"><b className="ptitle sm">Access lease {l.id}</b><IconBtn ghost icon="x" size={36} onClick={() => set2({ leaseView: null })} /></div>
          <div className="scroll" style={{ padding: '0 22px 22px' }}>
            <div className="qrwrap"><QR seed={l.code} /><div><span className="mlabel">OTP CODE</span><b className="otp">{l.code}</b><p className="small">Scoped to Health Context. Personal diary excluded by architecture.</p></div></div>
            <div className="kv"><span>Holder</span><b>{l.actor} · {l.org}</b></div>
            <div className="kv"><span>Purpose</span><b>{l.purpose}</b></div>
            <div className="kv"><span>Status</span><b>{l.status === 'active' ? <Countdown exp={l.expiresAt} /> : l.status}</b></div>
            <Label>Scope</Label>
            <div className="qchips">{l.scope.map((sc) => <span key={sc} className="pill tiny on">{sc}</span>)}<span className="pill tiny" style={{ color: 'var(--red)' }}><I n="lock" s={11} />Personal context</span></div>
            {l.status === 'active' && <Btn kind="dark" icon="lock" style={{ width: '100%', marginTop: 16 }} onClick={() => act.revoke(l.id)}>Revoke access now</Btn>}
          </div>
        </>
      )}
    </Drawer>
  );
}
function ShareWizard() {
  const open = useApp((s) => s.wizard);
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState('Consultation');
  const [scope, setScope] = useState(['Health events', 'Medications', 'Labs', 'Vitals', 'Documents']);
  const [mins, setMins] = useState(30);
  useEffect(() => { if (open) { setStep(0); } }, [open]);
  const SCOPE_OPTS = ['Health events', 'Medications', 'Labs', 'Vitals', 'Documents'];
  const next = () => setStep(step + 1);
  return (
    <Modal open={open} onClose={() => set2({ wizard: false })}>
      <div className="dhead" style={{ padding: 0, marginBottom: 14 }}><b className="ptitle sm">Share health information</b>
        <span className="mlabel">STEP {step + 1} / 4</span></div>
      <div className="steps">{[0, 1, 2, 3].map((i2) => <i key={i2} className={i2 <= step ? 'on' : ''} />)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <div className="optlist">
              {['Consultation', 'Emergency', 'Referral', 'Claims / HMO'].map((p) => (
                <button key={p} className={`opt ${purpose === p ? 'on' : ''}`} onClick={() => setPurpose(p)}><I n={p === 'Emergency' ? 'alert' : p === 'Claims / HMO' ? 'doc' : 'steth'} s={16} />{p}</button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="optlist">
              {SCOPE_OPTS.map((sc) => (
                <button key={sc} className={`opt ${scope.includes(sc) ? 'on' : ''}`} onClick={() => setScope(scope.includes(sc) ? scope.filter((x) => x !== sc) : [...scope, sc])}>
                  <I n={scope.includes(sc) ? 'check' : 'plus'} s={15} />{sc}
                </button>
              ))}
              <div className="opt locked"><I n="lock" s={15} />Personal context<span className="small"> — excluded by design</span></div>
            </div>
          )}
          {step === 2 && (
            <div className="pills">{[15, 30, 60, 120].map((m) => <button key={m} className={`pill ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{m} minutes</button>)}</div>
          )}
          {step === 3 && (
            <div>
              <div className="kv"><span>To</span><b>Dr. Amara Okafor · Central Clinic</b></div>
              <div className="kv"><span>Purpose</span><b>{purpose}</b></div>
              <div className="kv"><span>Scope</span><b>{scope.length} categories · Personal excluded</b></div>
              <div className="kv"><span>Window</span><b>{mins} minutes, then auto-expiry</b></div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="actrow" style={{ marginTop: 18, justifyContent: 'space-between' }}>
        <Btn kind="soft" sm onClick={() => (step === 0 ? set2({ wizard: false }) : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Btn>
        {step < 3 ? <Btn kind="dark" sm onClick={next}>Continue</Btn> :
          <Btn kind="dark" sm icon="shield" onClick={() => act.createLease({ purpose, scope, minutes: mins })}>Generate QR / OTP</Btn>}
      </div>
    </Modal>
  );
}

/* ═════════════ PROFILE PAGE ═════════════ */
const P_TABS = ['Overview', 'Medical', 'Allergies', 'Medications', 'Conditions', 'Emergency', 'Care Team'];
function ProfilePage() {
  const tab = useApp((s) => s.profileTab);
  return (
    <div className="scroll">
      <Reveal>
        <div className="hero">
          <div className="hrow">
            <span className="hid"><Avatar img={AV.nati} ring="#F4A8AC" size={34} name="N" /><b>Nati Adeyemi</b></span>
            <span className="hpill">Preferred name · Nati</span>
          </div>
          <div className="hcenter">
            <span className="hpill">Health identity</span>
            <div className="display" style={{ fontSize: 'clamp(26px,4vw,38px)' }}>24 yrs · O+ · AS</div>
            <span className="hsub">8 events · 4 verified · 2 documents · 1 active lease</span>
          </div>
        </div>
        <div className="rail">
          {CARE_TEAM.slice(0, 4).map((c) => <span key={c.name} title={c.name}><Avatar img={c.img} ring={c.ring} size={50} name={c.name} /></span>)}
        </div>
      </Reveal>
      <div className="pills" style={{ marginTop: 22 }}>{P_TABS.map((t) => <button key={t} className={`pill ${tab === t ? 'on' : ''}`} onClick={() => set2({ profileTab: t })}>{t}</button>)}</div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          <div className="grid2" style={{ marginTop: 16 }}>
            {(tab === 'Overview' || tab === 'Medical') && (
              <div className="card"><Label>Medical baseline</Label>
                <FactRow k="Blood group" v="O+" src="self" />
                <FactRow k="Genotype" v="AS" src="self" />
                <FactRow k="Allergy" v="Penicillin" src="clinician" />
                <FactRow k="Condition" v="Asthma — provisional" src="ai" />
                <FactRow k="Medication" v="Salbutamol inhaler" src="clinician" />
              </div>
            )}
            {tab === 'Overview' && (
              <div className="card"><Label>Personal summary</Label>
                <p className="small">Student, active with school practicals and football. Prefers concise replies and being called Nati. Values privacy: personal diary stays personal.</p>
                <Label right={<button className="link" onClick={() => act.nav('timeline')}>Timeline</button>}>Recent health changes</Label>
                <FactRow k="19 Aug" v="Breathing difficulty" src="self" />
                <FactRow k="20 Aug" v="Inhaler started" src="clinician" />
              </div>
            )}
            {tab === 'Allergies' && <div className="card"><Label>Allergies</Label><FactRow k="Penicillin" v="Reaction: rash (2024)" src="clinician" /></div>}
            {tab === 'Medications' && <div className="card"><Label>Current medications</Label><FactRow k="Salbutamol 100mcg" v="2 puffs PRN before exertion" src="clinician" /></div>}
            {tab === 'Conditions' && <div className="card"><Label>Conditions</Label><FactRow k="Exercise-induced asthma" v="Provisional — spirometry 28 Aug" src="ai" /></div>}
            {tab === 'Emergency' && (
              <div className="card"><Label>Emergency</Label>
                <FactRow k="Contact" v="Mrs. Adeyemi · +234 801 000 0000" src="self" />
                <FactRow k="Blood group" v="O+" src="self" />
                <FactRow k="Allergy alert" v="Penicillin" src="clinician" />
              </div>
            )}
            {tab === 'Care Team' && (
              <div className="card"><Label>Care team</Label>
                {CARE_TEAM.map((c) => (
                  <div key={c.name} className="minirow"><Avatar img={c.img} ring={c.ring} size={38} name={c.name} /><span><b>{c.name}</b><span className="small block">{c.role}</span></span></div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ═════════════ SETTINGS PAGE ═════════════ */
const S_TABS = ['Account', 'Conversation', 'Notifications', 'Privacy', 'Security', 'Data & History', 'Appearance', 'Help'];
function SettingsPage() {
  const tab = useApp((s) => s.settingsTab);
  const prefs = useApp((s) => s.prefs);
  const theme = useApp((s) => s.theme);
  const setPref = (k, v) => { store.setState({ prefs: { ...S().prefs, [k]: v } }); };
  return (
    <div className="scroll setgrid">
      <div className="pills col">
        {S_TABS.map((t) => <button key={t} className={`pill ${tab === t ? 'on' : ''}`} onClick={() => set2({ settingsTab: t })}>{t}</button>)}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {tab === 'Account' && (<><Label>Account</Label>
            <div className="kv"><span>Name</span><b>Nati Adeyemi</b></div>
            <div className="kv"><span>Email</span><b>nati@mhistree.app</b></div>
            <div className="kv"><span>Phone</span><b>+234 802 000 0000</b></div>
            <div className="kv"><span>Preferred name</span><b>Nati</b></div>
            <Btn kind="soft" sm icon="edit" onClick={() => act.toast('Profile editing arrives with account service', 'edit')}>Edit identity</Btn></>)}
          {tab === 'Conversation' && (<><Label>Conversation</Label>
            <div className="kv"><span>Response style</span><span className="pills">{['Concise', 'Detailed'].map((st) => <button key={st} className={`pill tiny ${prefs.style === st ? 'on' : ''}`} onClick={() => { setPref('style', st); act.toast('Response style: ' + st, 'chat'); }}>{st}</button>)}</span></div>
            <div className="kv"><span>Language</span><span className="pills">{['English', 'Pidgin', 'Yoruba', 'Hausa'].map((lg) => <button key={lg} className={`pill tiny ${prefs.lang === lg ? 'on' : ''}`} onClick={() => setPref('lang', lg)}>{lg}</button>)}</span></div>
            <div className="kv"><span>Voice replies</span><Switch on={prefs.voice} onChange={(v) => setPref('voice', v)} /></div></>)}
          {tab === 'Notifications' && (<><Label>Notifications</Label>
            <div className="kv"><span>Reminders</span><Switch on={prefs.reminders} onChange={(v) => setPref('reminders', v)} /></div>
            <div className="kv"><span>Appointments</span><Switch on={prefs.notif} onChange={(v) => setPref('notif', v)} /></div>
            <div className="kv"><span>Sharing / access alerts</span><Switch on={prefs.shareAlerts} onChange={(v) => setPref('shareAlerts', v)} /></div></>)}
          {tab === 'Privacy' && (<><Label>Privacy</Label>
            <div className="kv"><span>Personal memory (private)</span><Switch on={prefs.personalMem} onChange={(v) => { setPref('personalMem', v); act.toast(v ? 'Personal memory on' : 'Personal memory paused', 'lock'); }} /></div>
            <div className="kv"><span>Health memory (shareable)</span><Switch on={prefs.healthMem} onChange={(v) => setPref('healthMem', v)} /></div>
            <Btn kind="soft" sm icon="shield" onClick={() => act.nav('sharing')}>Access history</Btn></>)}
          {tab === 'Security' && (<><Label>Security</Label>
            <div className="kv"><span>This device · Lagos NG</span><b>Active now</b></div>
            <div className="kv"><span>Web · Chrome</span><button className="link" onClick={act.signOut}>Sign out</button></div>
            <Btn kind="soft" sm icon="lock" onClick={() => act.toast('Password reset link sent', 'lock')}>Change password</Btn></>)}
          {tab === 'Data & History' && (<><Label>Data & History</Label>
            <p className="small">Raw chats, embeddings and media follow retention policy. Derived summaries always point back to source evidence.</p>
            <div className="actrow"><Btn kind="dark" sm icon="download" onClick={act.export}>Download health history</Btn>
              <Btn kind="soft" sm icon="edit" onClick={() => act.toast('Correction requests reviewed within 72h', 'edit')}>Correction requests</Btn>
              <Btn kind="soft" sm icon="x" onClick={() => act.toast('Deletion request logged for review', 'alert')}>Request deletion</Btn></div></>)}
          {tab === 'Appearance' && (<><Label>Appearance</Label>
            <div className="kv"><span>Theme</span><span className="pills">{['light', 'dark'].map((t) => <button key={t} className={`pill tiny ${theme === t ? 'on' : ''}`} onClick={() => set2({ theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</span></div>
            <p className="small">Soft-float surface system · one saturated hero · one dark primary action.</p></>)}
          {tab === 'Help' && (<><Label>Help</Label>
            <div className="minirow"><I n="spark" s={16} c="#478BEE" /><span className="small">What can Mhistree remember? Only what you share or upload — always with provenance.</span></div>
            <div className="minirow"><I n="shield" s={16} c="#2F8F5B" /><span className="small">Who sees my diary? Nobody. Personal Context is architecturally excluded from clinician access.</span></div>
            <Btn kind="soft" sm icon="chat" onClick={() => act.nav('chat')}>Talk to Mhistree</Btn></>)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ═════════════ CLINICIAN PAGES ═════════════ */
function ClinDashboard() {
  const events = useApp((s) => s.events);
  const need = events.filter((e) => e.status === 'reported' || e.status === 'inferred').length;
  return (
    <div className="scroll">
      <div className="phead"><div><h1 className="ptitle">Good evening, Dr. Okafor</h1><p className="psub">What needs your attention?</p></div>
        <span className="hpill dark"><I n="clock" s={13} />3 consultations today</span></div>
      <div className="grid3">
        <Reveal><div className="card"><Label right={<span className="badge" style={{ color: 'var(--red)' }}><i className="dot" style={{ background: 'var(--red)' }} />Urgent</span>}>Alerts</Label>
          <button className="minirow" onClick={() => act.navClin('patient')}><span className="tic sm" style={{ background: '#8A63D226', color: '#8A63D2' }}><I n="pulse" s={14} /></span>
            <span><b>Nati · HR 118 bpm at rest</b><span className="small block">Device reading · 19 Aug, post-episode</span></span></button>
          <button className="minirow" onClick={() => act.navClin('patient')}><span className="tic sm" style={{ background: '#C08A2D26', color: '#C08A2D' }}><I n="spark" s={14} /></span>
            <span><b>AI hypothesis awaiting review</b><span className="small block">Possible exercise-induced asthma</span></span></button>
        </div></Reveal>
        <Reveal d={0.06}><div className="card"><Label right={<span className="badge">{need} pending</span>}>Needs verification</Label>
          <p className="small">Patient-reported events and AI inferences require your clinical authority before entering the verified ledger.</p>
          <Btn kind="dark" sm icon="check" onClick={() => act.navClin('patient')}>Review queue</Btn>
        </div></Reveal>
        <Reveal d={0.12}><div className="card"><Label>Upcoming</Label>
          <div className="minirow"><span className="tic sm" style={NEUTRAL_CHIP}><I n="cal" s={14} /></span><span><b>Nati Adeyemi</b><span className="small block">28 Aug · Spirometry</span></span></div>
          <div className="minirow"><span className="tic sm" style={NEUTRAL_CHIP}><I n="cal" s={14} /></span><span><b>Musa Ibrahim</b><span className="small block">29 Aug · Follow-up (no lease yet)</span></span></div>
        </div></Reveal>
      </div>
    </div>
  );
}
function ClinPatients() {
  return (
    <div className="scroll">
      <div className="phead"><div><h1 className="ptitle">My patients</h1><p className="psub">No global search — access requires a patient-created lease</p></div></div>
      <Reveal><button className="card evcard" onClick={() => act.navClin('patient')}>
        <Avatar img={AV.nati} ring="#F4A8AC" size={44} name="N" />
        <span className="evmain"><b>Nati Adeyemi</b><span className="evwhen">24 · O+ · AS · last interaction today 7:05 PM</span>
          <span className="evbadges"><span className="badge" style={{ color: 'var(--green)' }}><i className="dot" style={{ background: 'var(--green)' }} />Lease active</span><span className="badge" style={{ color: 'var(--amber)' }}><i className="dot" style={{ background: 'var(--amber)' }} />2 alerts</span></span></span>
        <I n="chev" s={16} />
      </button></Reveal>
      <Reveal d={0.06}><button className="card evcard" onClick={() => act.toast('No active lease — ask the patient to share access', 'lock')}>
        <span className="av init" style={{ width: 44, height: 44, background: '#B7E4C7' }}>M</span>
        <span className="evmain"><b>Musa Ibrahim</b><span className="evwhen">41 · last visit 12 Aug</span>
          <span className="evbadges"><span className="badge" style={{ color: 'var(--red)' }}><i className="dot" style={{ background: 'var(--red)' }} />No lease</span></span></span>
        <I n="lock" s={16} />
      </button></Reveal>
    </div>
  );
}
function ClinPatient() {
  const events = useApp((s) => s.events);
  const notes = useApp((s) => s.notes);
  const leases = useApp((s) => s.leases);
  const lease = leases.find((l) => l.status === 'active');
  const [tab, setTab] = useState('Timeline');
  const [note, setNote] = useState('');
  const [feed, setFeed] = useState([{ q: null, a: 'AI console scoped to Nati Adeyemi · Health Context · active lease. I can summarise evidence, surface gaps and rank hypotheses — verification stays with you.' }]);
  const [ask, setAsk] = useState('');
  useEffect(() => { act.logAccess('Opened patient record · Nati Adeyemi'); }, []);
  const unverified = events.filter((e) => e.status === 'reported' || e.status === 'inferred');
  const hypo = events.find((e) => e.id === 'e7');
  const askAI = (q) => {
    const A = {
      'Summarize the last 30 days': 'Aug: 8 events — 2 symptom reports (exertional breathlessness/wheeze), 1 device HR spike, inhaler started (verified), FBC within range (lab), GP visit 07 Aug. Trend: exertional pattern, improving since inhaler.',
      'What changed?': 'Inhaler started 20 Aug (clinician-verified). Symptom reports clustered 17–19 Aug. No new labs since 15 Aug.',
      'What remains unverified?': `${unverified.length} items: ` + unverified.map((e) => e.title).join('; ') + '.',
      'What information is missing?': 'Spirometry result (scheduled 28 Aug), symptom severity scores, trigger confirmation, medication adherence.',
    };
    setFeed((f) => [...f, { q, a: A[q] || 'Based on the authorised record: ' + (A['What changed?']) }]);
  };
  if (!lease) return <div className="scroll"><div className="card inset" style={{ padding: 40, textAlign: 'center' }}><I n="lock" s={28} /><h2 className="ptitle" style={{ margin: '12px 0 6px' }}>No active lease</h2><p className="small">Ask the patient to generate an access lease from their app.</p></div></div>;
  return (
    <div className="scroll">
      <Reveal><div className="card pheader">
        <Avatar img={AV.nati} ring="#F4A8AC" size={54} name="N" />
        <div style={{ flex: 1 }}>
          <b className="ptitle sm">Nati Adeyemi</b>
          <span className="small block">24 · O+ · AS · Allergy: Penicillin (verified) · Med: Salbutamol PRN</span>
          <span className="evbadges" style={{ marginTop: 6 }}><ProvBadge src="clinician" /><ProvBadge src="ai" /></span>
        </div>
        <div className="leasepill"><I n="shield" s={14} /><Countdown exp={lease.expiresAt} prefix="Lease · " /></div>
      </div></Reveal>
      <div className="cgrid">
        <Reveal d={0.05}><div className="card">
          <Label right={<span className="badge" style={{ color: 'var(--amber)' }}><i className="dot" style={{ background: 'var(--amber)' }} />AI — not a note</span>}>AI clinical briefing</Label>
          {[['What changed', 'Exertional breathlessness clustered 17–19 Aug; inhaler started 20 Aug; symptoms improving.'],
          ['Recent episodes', 'Respiratory symptoms 17–21 Aug (4 events).'],
          ['Important background', 'Penicillin allergy (verified). FBC normal. Prior allergic reaction admission 04 Aug, resolved.'],
          ['Open questions', 'Spirometry pending 28 Aug. Trigger confirmation. Adherence unknown.'],
          ['Potential concerns', 'One resting HR spike (118 bpm, device) following the breathing episode.']].map(([k, v]) => (
            <div key={k} className="briefsec"><span className="mlabel">{k.toUpperCase()}</span><p className="small">{v}</p>
              <button className="link" onClick={() => set2({ evidenceId: k === 'Potential concerns' ? 'e3' : 'e1' })}>View evidence</button></div>
          ))}
        </div></Reveal>
        <Reveal d={0.1}><div className="card">
          <div className="pills" style={{ marginBottom: 12 }}>{['Timeline', 'Vitals', 'Documents'].map((t) => <button key={t} className={`pill tiny ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
          {tab === 'Timeline' && events.map((ev) => (
            <button key={ev.id} className="minirow" onClick={() => set2({ evidenceId: ev.id })}>
              <span className="tic sm" style={{ background: (TYPE_META[ev.type]?.c || '#888') + '26', color: TYPE_META[ev.type]?.c }}><I n={TYPE_META[ev.type]?.icon} s={14} /></span>
              <span className="ell"><b>{ev.title}</b><span className="small block">{ev.when}</span></span>
              <StatusBadge st={ev.status} />
            </button>
          ))}
          {tab === 'Vitals' && (<><div className="vitalhead"><b className="vnum">79</b><span className="small">bpm latest · spike 118 on 19 Aug</span></div>
            <div style={{ height: 90 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={HR_DATA}><defs><linearGradient id="hrg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#478BEE" stopOpacity={0.35} /><stop offset="100%" stopColor="#478BEE" stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="v" stroke="#478BEE" strokeWidth={2.4} fill="url(#hrg2)" /></AreaChart></ResponsiveContainer></div></>)}
          {tab === 'Documents' && S().documents.map((d) => (
            <div key={d.id} className="minirow"><span className="tic sm" style={{ background: '#C08A2D26', color: '#C08A2D' }}><I n="doc" s={14} /></span><span><b>{d.name}</b><span className="small block">{d.date}</span></span></div>
          ))}
        </div></Reveal>
        <Reveal d={0.15}><div className="card">
          <Label>Clinical action console</Label>
          {hypo && (
            <div className="card inset" style={{ marginBottom: 12, padding: 14 }}>
              <span className="mlabel">HYPOTHESIS · AI INFERRED</span>
              <b>{hypo.title}</b>
              <div className="suprow"><div className="supbar"><i style={{ width: hypo.support + '%' }} /></div><span className="small">Support {hypo.support}% · Moderate</span></div>
              <div className="qchips">{['e1', 'e2', 'e3'].map((id) => <button key={id} className="pill tiny" onClick={() => set2({ evidenceId: id })}>{evById(id)?.title}</button>)}</div>
              <div className="actrow" style={{ marginTop: 10 }}>
                <Btn kind="dark" sm icon="check" onClick={() => act.verify(hypo.id)}>Verify</Btn>
                <Btn kind="soft" sm icon="x" onClick={() => act.reject(hypo.id)}>Reject</Btn>
              </div>
            </div>
          )}
          <span className="mlabel">VERIFICATION QUEUE</span>
          {unverified.filter((e) => e.id !== 'e7').map((ev) => (
            <div key={ev.id} className="vrow">
              <span className="small ell"><b>{ev.title}</b> · {ev.when}</span>
              <span className="actrow" style={{ margin: 0 }}>
                <Btn kind="soft" sm icon="check" onClick={() => act.verify(ev.id)}>Verify</Btn>
                <Btn kind="soft" sm icon="edit" onClick={() => set2({ correctionId: ev.id })}>Correct</Btn>
                <Btn kind="soft" sm icon="x" onClick={() => act.reject(ev.id)}>Reject</Btn>
              </span>
            </div>
          ))}
          {unverified.length === 0 && <p className="small">Queue clear — everything is verified or rejected.</p>}
          <Label right={<span className="badge">Clinician-authored</span>}>Encounter note</Label>
          <textarea id="encNote" className="tarea" placeholder="Write your assessment…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn kind="soft" sm icon="plus" onClick={() => { if (!note.trim()) return; store.setState({ notes: [{ id: 'n' + Date.now(), text: note, by: 'Dr. Amara Okafor', at: 'Today' }, ...notes] }); setNote(''); act.toast('Note committed as clinician-authored fact', 'check'); }}>Add note</Btn>
          {notes.map((nt) => <div key={nt.id} className="minirow"><I n="edit" s={14} c="#9A9AA0" /><span className="small">{nt.text} — <b>{nt.by}, {nt.at}</b></span></div>)}
          <Label>Ask about this patient</Label>
          <div className="qchips">{['Summarize the last 30 days', 'What changed?', 'What remains unverified?', 'What information is missing?'].map((p) => <button key={p} className="pill tiny" onClick={() => askAI(p)}>{p}</button>)}</div>
          <div className="feed">{feed.map((f, i2) => (
            <div key={i2} className="feeditem">{f.q && <b className="small">{f.q}</b>}<p className="small">{f.a}</p></div>
          ))}</div>
          <form className="actrow" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) { askAI(ask); setAsk(''); } }}>
            <input className="cinput" style={{ flex: 1 }} placeholder="Question…" value={ask} onChange={(e) => setAsk(e.target.value)} />
            <Btn kind="dark" sm icon="up">Ask</Btn>
          </form>
        </div></Reveal>
      </div>
      <div className="ctoolbar">
        <button onClick={() => set2({ aiDrawer: { context: 'patient' } })}><I n="spark" s={18} />AI</button>
        <button onClick={() => { const u = unverified[0]; if (u) set2({ evidenceId: u.id }); else act.toast('Queue clear — all verified', 'check'); }}><I n="check" s={18} />Verify</button>
        <button onClick={() => { const el = document.getElementById('encNote'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }}><I n="edit" s={18} />Note</button>
        <button onClick={() => set2({ cmd: true })}><I n="gear" s={18} />More</button>
      </div>
    </div>
  );
}

/* ═════════════ OVERLAYS ═════════════ */
function EvidenceDrawer() {
  const evidenceId = useApp((s) => s.evidenceId);
  const ev = S().events.find((e) => e.id === evidenceId);
  return (
    <Drawer open={!!evidenceId} onClose={() => set2({ evidenceId: null })}>
      {ev && (
        <>
          <div className="dhead"><b className="ptitle sm">Why is this here?</b><IconBtn ghost icon="x" size={36} onClick={() => set2({ evidenceId: null })} /></div>
          <div className="scroll" style={{ padding: '0 22px 22px' }}>
            <div className="evhead"><span className="tic" style={{ background: (TYPE_META[ev.type]?.c || '#888') + '26', color: TYPE_META[ev.type]?.c }}><I n={TYPE_META[ev.type]?.icon} s={18} /></span>
              <div><b>{ev.title}</b><span className="small block">{ev.when}</span></div></div>
            <div className="evbadges"><ProvBadge src={ev.src} /><StatusBadge st={ev.status} />{ev.verifiedBy && <span className="badge"><i className="dot" style={{ background: '#2F8F5B' }} />by {ev.verifiedBy}</span>}</div>
            <p className="small" style={{ margin: '12px 0' }}>{ev.desc}</p>
            <Label>Original evidence</Label>
            <div className="quote">{ev.sourceMsg}</div>
            <Label>Provenance chain</Label>
            {['Source captured (immutable)', 'Extraction worker · candidate event', 'Validation · dedup & conflict check', 'Current status: ' + ev.status].map((st, i2) => (
              <div key={st} className="chain"><span className="chaindot" style={{ background: i2 === 3 ? STATUS_C[ev.status] : 'var(--ink3)' }} /><span className="small">{st}</span></div>
            ))}
            {ev.corrections?.length > 0 && (<><Label>Corrections (original preserved)</Label>{ev.corrections.map((c, i2) => <div key={i2} className="quote">“{c.note}” — {c.at}</div>)}</>)}
            <div className="actrow" style={{ marginTop: 16 }}>
              <Btn kind="soft" sm icon="edit" onClick={() => set2({ correctionId: ev.id })}>Correct</Btn>
              <Btn kind="soft" sm icon="alert" onClick={() => act.dispute(ev.id)}>Dispute</Btn>
              <Btn kind="dark" sm icon="eye" onClick={() => { const sid = ev.session; set2({ evidenceId: null }); if (sid) act.openSession(sid); else if (ev.docId) set2({ docView: ev.docId }); else act.toast('Source: ' + ev.sourceMsg, 'link'); }}>View source</Btn>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}
function CorrectionDialog() {
  const correctionId = useApp((s) => s.correctionId);
  const [txt, setTxt] = useState('');
  const ev = S().events.find((e) => e.id === correctionId);
  return (
    <Modal open={!!correctionId} onClose={() => set2({ correctionId: null })} w={460}>
      <b className="ptitle sm">This is incorrect</b>
      <p className="small" style={{ margin: '8px 0 12px' }}>About: <b>{ev?.title}</b>. The original record is preserved — your correction becomes a new provenance-bearing state.</p>
      <textarea className="tarea" autoFocus placeholder="What’s wrong?" value={txt} onChange={(e) => setTxt(e.target.value)} />
      <div className="actrow" style={{ justifyContent: 'flex-end' }}>
        <Btn kind="soft" sm onClick={() => set2({ correctionId: null })}>Cancel</Btn>
        <Btn kind="dark" sm icon="check" onClick={() => { if (txt.trim()) { act.correct(correctionId, txt); setTxt(''); } }}>Submit correction</Btn>
      </div>
    </Modal>
  );
}
function AIDrawer() {
  const aiDrawer = useApp((s) => s.aiDrawer);
  const [feed, setFeed] = useState([]);
  useEffect(() => { setFeed([]); }, [aiDrawer]);
  const ctx = aiDrawer?.context || 'health';
  const PROMPTS = ctx === 'patient' ? ['Summarize the last 30 days', 'What changed?', 'What remains unverified?', 'What information is missing?']
    : ctx === 'document' ? ['What does this document change?', 'Extract the key values']
    : ctx === 'conversation' ? ['What memory did you use?', 'Show sources for this reply']
    : ['What changed recently?', 'Any red flags?', 'Summarise my week'];
  const answer = (q) => ({
    'What changed recently?': 'Two new symptom reports (17–19 Aug), one device HR spike, and a verified medication start. Overall trend: improving.',
    'Any red flags?': 'Nothing emergency-grade. The resting HR spike is worth verifying — it followed the breathing episode.',
    'Summarise my week': 'Busy week: practicals, exams, one breathing episode that resolved, inhaler started. Sleep slightly short.',
    'What memory did you use?': 'I retrieved your respiratory episode (17–21 Aug) and inhaler start — nothing else left your private context.',
    'Show sources for this reply': 'Sources: e1 breathing difficulty, e4 inhaler start. Both carry provenance.',
    'What does this document change?': 'It adds lab-verified evidence (FBC normal) that constrains differential hypotheses.',
    'Extract the key values': 'Extracted: Hb 13.8 g/dL, WBC within range. Linked to your timeline as a lab-verified event.',
    'Summarize the last 30 days': 'Aug: 8 events — 2 symptom reports, 1 device HR spike, inhaler started (verified), FBC normal (lab), GP visit 07 Aug.',
    'What changed?': 'Inhaler started 20 Aug (verified). Symptom cluster 17–19 Aug. No new labs since 15 Aug.',
    'What remains unverified?': 'Symptom reports (e1, e2, e3) and the AI hypothesis (e7) await clinician verification.',
    'What information is missing?': 'Spirometry (28 Aug), severity scores, trigger confirmation, adherence.',
  })[q] || 'I can only reason over the authorised evidence in this context.';
  return (
    <Drawer open={!!aiDrawer} onClose={() => set2({ aiDrawer: null })}>
      <div className="dhead"><span className="hpill dark"><I n="spark" s={13} />Ask Mhistree</span><IconBtn ghost icon="x" size={36} onClick={() => set2({ aiDrawer: null })} /></div>
      <div className="scroll" style={{ padding: '0 22px 22px' }}>
        <p className="small">Context: <b>{ctx}</b> · answers stay evidence-linked.</p>
        <div className="qchips">{PROMPTS.map((p) => <button key={p} className="pill tiny on" onClick={() => setFeed((f) => [...f, { q: p, a: answer(p) }])}>{p}</button>)}</div>
        <div className="feed">{feed.map((f, i2) => (
          <motion.div key={i2} className="feeditem" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><b className="small">{f.q}</b><p className="small">{f.a}</p></motion.div>
        ))}</div>
      </div>
    </Drawer>
  );
}
function CommandMenu() {
  const open = useApp((s) => s.cmd);
  const [q, setQ] = useState('');
  const items = [
    { l: 'New chat', i: 'plus', f: act.newChat }, { l: 'Open timeline', i: 'pulse', f: () => act.nav('timeline') },
    { l: 'Open health', i: 'heart', f: () => act.nav('health') }, { l: 'Upload document', i: 'up', f: act.upload },
    { l: 'Share health context', i: 'share', f: () => set2({ wizard: true, cmd: false }) }, { l: 'Open profile', i: 'user', f: act.openProfile },
    { l: 'Open settings', i: 'gear', f: () => act.nav('settings') }, { l: 'Switch to clinician', i: 'steth', f: () => act.setRole('clinician') },
  ].filter((it) => it.l.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={() => set2({ cmd: false })} w={480}>
      <div className="searchpill big"><I n="search" s={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command…" /></div>
      <div className="cmdlist">
        {items.map((it) => <button key={it.l} className="nav" onClick={() => { it.f(); set2({ cmd: false }); }}><I n={it.i} s={16} />{it.l}</button>)}
      </div>
    </Modal>
  );
}

/* ═════════════ APP ROOT ═════════════ */
export default function App() {
  const role = useApp((s) => s.role);
  const page = useApp((s) => s.page);
  const clinPage = useApp((s) => s.clinPage);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set2({ cmd: !S().cmd }); }
      if (e.key === 'Escape') set2({ cmd: false, drawer: false, authOpen: false, evidenceId: null, correctionId: null, wizard: false, aiDrawer: null, docView: null, leaseView: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const PAGES = { chat: <ChatPage />, timeline: <TimelinePage />, health: <HealthPage />, documents: <DocumentsPage />, sharing: <SharingPage />, profile: <ProfilePage />, settings: <SettingsPage /> };
  const C_PAGES = { dashboard: <ClinDashboard />, patients: <ClinPatients />, patient: <ClinPatient /> };
  return (
    <div className="app" data-theme={theme}>
      <style>{CSS}</style>
      <AnimatePresence>
        {page === 'auth' ? (
          <AuthPage key="auth" />
        ) : (
          <motion.div className="stage" key="stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MobileTopBar />
            <Sidebar />
            <main className="main">
              <AnimatePresence mode="wait">
                <motion.div key={role + (role === 'patient' ? page : clinPage)} className="page"
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
                  {role === 'patient' ? PAGES[page] : C_PAGES[clinPage]}
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
      <NavDrawer />
      <AuthGate />
      <EvidenceDrawer /><CorrectionDialog /><ShareWizard /><LeaseDrawer /><DocViewer /><AIDrawer /><CommandMenu /><Toasts />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SOFT-FLOAT UI — CSS (light + layered near-black dark theme)
═══════════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://cdn.jsdelivr.net/fontsource/css/manrope@latest/index.css');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100%}
button{font:inherit;border:none;background:none;cursor:pointer;color:inherit}
input,textarea{font:inherit;color:inherit}
.app{
  --stage:#F3F3F2; --shell:#ECECEB; --shell2:#F1F1F0; --card:#F6F6F5;
  --ink:#181818; --ink2:#6E6E6E; --ink3:#9A9A9A;
  --hero1:#69A5FF; --hero2:#347BDD; --cta:#111;
  --bl:rgba(255,255,255,.8); --bs:rgba(255,255,255,.55);
  --sh1:0 3px 8px rgba(0,0,0,.05); --sh2:0 6px 14px rgba(0,0,0,.06); --sh3:0 22px 45px rgba(0,0,0,.10);
  --green:#2F8F5B; --amber:#C08A2D; --red:#CC5348;
  color:var(--ink); font-family:'Manrope',system-ui,sans-serif; letter-spacing:-0.01em;
}
.app{min-height:100vh}
.stage{min-height:100vh;display:grid;grid-template-columns:288px 1fr;gap:20px;max-width:1480px;margin:0 auto;padding:20px;
  background:radial-gradient(circle at 50% 30%, var(--bl), transparent 60%) var(--stage);}
/* sidebar */
.side{background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:28px;box-shadow:var(--sh3);
  padding:18px 12px;display:flex;flex-direction:column;gap:4px;position:sticky;top:20px;height:calc(100vh - 40px);overflow:hidden}
.brand{display:flex;align-items:center;gap:10px;padding:4px 10px 16px;font-weight:800;font-size:17px;letter-spacing:-0.02em}
.brand .clinlab{color:var(--hero2);margin-left:6px;font-size:11px;background:var(--card);border:1px solid var(--bl);padding:3px 8px;border-radius:999px}
.dx{margin-left:auto;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:var(--ink2)}
.dx:hover{background:var(--card);color:var(--ink)}
.nav{display:flex;align-items:center;gap:11px;padding:10px 14px;border-radius:999px;color:var(--ink2);font-weight:700;font-size:13.5px;border:1px solid transparent;transition:all .18s;text-align:left;width:100%}
.nav:hover{background:var(--card);color:var(--ink)}
.nav.on{background:var(--card);border-color:var(--bl);color:var(--ink);box-shadow:var(--sh1)}
.nav .ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.navbadge{margin-left:auto;background:var(--red);color:#fff;font-size:10.5px;padding:2px 7px;border-radius:999px}
.mlabel{font-size:10.5px;font-weight:800;color:var(--ink3);letter-spacing:.08em}
.glabel{font-size:10.5px;font-weight:800;color:var(--ink3);margin:10px 14px 4px;letter-spacing:.06em}
.recents{flex:1;overflow-y:auto;min-height:40px}
.sidefoot{border-top:1px solid var(--bs);padding-top:10px;display:flex;flex-direction:column;gap:4px}
.prow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:18px;cursor:pointer}
.prow:hover{background:var(--card)}
.pmeta{flex:1;text-align:left}.pmeta b{font-size:13px;display:block}.pmeta span{font-size:11px;color:var(--ink2)}
/* top bar + drawer */
.topbar{display:none}
.drawer-left{position:fixed;top:0;left:0;bottom:0;width:min(86vw,360px);z-index:80;display:flex;flex-direction:column;gap:4px;
  background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-left:none;border-radius:0 28px 28px 0;
  box-shadow:var(--sh3);overflow-y:auto;padding:16px 12px 20px}
.scrimside{z-index:75}
/* main shell */
.main{background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:32px;box-shadow:var(--sh3);overflow:hidden;min-height:calc(100vh - 40px)}
.page{height:100%;display:flex;flex-direction:column}
.pagecol{display:flex;flex-direction:column;height:100%}
.scroll{overflow-y:auto;padding:28px 32px;height:100%}
.scroll::-webkit-scrollbar,.recents::-webkit-scrollbar,.msgs::-webkit-scrollbar{width:8px}
.scroll::-webkit-scrollbar-thumb,.msgs::-webkit-scrollbar-thumb{background:var(--bs);border-radius:8px}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;font-weight:800;cursor:pointer;border:1px solid var(--bl);font-size:13.5px;transition:transform .15s,box-shadow .2s,filter .2s;white-space:nowrap}
.btn:active{transform:translateY(1px) scale(.99)}
.btn:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.btn.dark{background:linear-gradient(180deg,#242424,#0d0d0d);color:#fff;border-color:rgba(255,255,255,.14);box-shadow:0 7px 15px rgba(0,0,0,.22), inset 0 1px 1px rgba(255,255,255,.28);padding:0 22px;height:50px}
.btn.soft{background:linear-gradient(180deg,var(--card),var(--shell));color:var(--ink);box-shadow:var(--sh1), inset 0 1px 2px rgba(255,255,255,.6);padding:0 20px;height:50px}
.btn.icon{width:48px;height:48px;padding:0;background:var(--card);box-shadow:var(--sh1), inset 0 1px 1px rgba(255,255,255,.55);color:var(--ink2);border-radius:50%}
.btn.icon.ghost{background:transparent;box-shadow:none;border-color:transparent}
.btn.sm{height:38px;padding:0 15px;font-size:12.5px}
.btn.icon.sm{width:38px;height:38px}
.spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
/* hero */
.hero{position:relative;background:linear-gradient(145deg,#68A4FF 0%,#478BEE 48%,#2F74D8 100%);border-radius:28px 28px 42px 42px;color:#fff;padding:20px 22px 54px;
  box-shadow:inset 0 1px 1px rgba(255,255,255,.5), 0 14px 34px rgba(47,116,216,.28)}
.hero::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:radial-gradient(circle at 35% 18%, rgba(255,255,255,.42), rgba(255,255,255,0) 55%)}
.hrow{display:flex;justify-content:space-between;align-items:center;position:relative}
.hid{display:flex;align-items:center;gap:9px;font-weight:800}
.hutil{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff;display:grid;place-items:center;backdrop-filter:blur(6px)}
.hcenter{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 0 4px;position:relative}
.hsub{font-size:12.5px;font-weight:700;color:rgba(255,255,255,.85)}
.hpill{display:inline-flex;gap:7px;align-items:center;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(8px);font-size:12px;font-weight:800;color:rgba(255,255,255,.95)}
.hpill.dark{background:var(--card);color:var(--ink2);border:1px solid var(--bl)}
.display{font-size:clamp(40px,6vw,58px);font-weight:800;letter-spacing:-0.04em;line-height:.95}
.display.sm{font-size:clamp(26px,4vw,36px);letter-spacing:-0.03em}
/* avatar rail */
.rail{display:flex;justify-content:center;margin-top:-28px;position:relative;z-index:2}
.rail .av,.rail span{margin-left:-9px}
.rail span:first-child{margin-left:0}
.av{width:48px;height:48px;border-radius:50%;border:3px solid rgba(255,255,255,.9);object-fit:cover;background:var(--card);display:inline-block}
.av.init{display:inline-grid;place-items:center;font-weight:800;color:#181818}
/* cards */
.card{background:var(--card);border:1px solid var(--bl);border-radius:24px;box-shadow:var(--sh2), inset 0 1px 1px rgba(255,255,255,.5);padding:18px;text-align:left;width:100%}
.card.inset{background:transparent;box-shadow:none;border:1px solid var(--bs)}
button.card{cursor:pointer;transition:transform .18s, box-shadow .2s}
button.card:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.09)}
.labrow{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}
.grid3{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:6px}
@media(min-width:1200px){.grid3{grid-template-columns:1fr 1fr 1fr}}
/* pills */
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.pills.sub{margin-top:8px}
.pills.col{flex-direction:column;align-items:stretch}
.pill{padding:10px 16px;border-radius:999px;background:var(--card);border:1px solid var(--bl);font-size:13px;font-weight:800;color:var(--ink2);box-shadow:var(--sh1), inset 0 1px 1px rgba(255,255,255,.5);transition:all .15s}
.pill:hover{color:var(--ink)}
.pill.on{background:linear-gradient(180deg,#242424,#0d0d0d);color:#fff;border-color:rgba(255,255,255,.15);box-shadow:0 6px 12px rgba(0,0,0,.2)}
.pill.tiny{padding:6px 11px;font-size:11.5px}
/* badges */
.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:10.5px;font-weight:800;background:var(--card);border:1px solid var(--bl);color:var(--ink2)}
.badge .dot{width:7px;height:7px;border-radius:50%}
/* page heads */
.phead{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.ptitle{font-size:clamp(22px,3vw,30px);font-weight:800;letter-spacing:-0.03em}
.ptitle.sm{font-size:17px}
.psub{color:var(--ink2);font-size:13px;margin-top:4px;font-weight:600}
.searchpill{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--bl);border-radius:999px;padding:10px 16px;box-shadow:var(--sh1);color:var(--ink3)}
.searchpill input{border:none;outline:none;background:transparent;width:170px;font-size:13px;font-weight:600;color:var(--ink)}
.searchpill.big{padding:14px 18px;margin-bottom:12px}.searchpill.big input{width:100%}
/* timeline */
.tl{position:relative;padding-left:22px;margin-top:6px}
.tl::before{content:'';position:absolute;left:6px;top:8px;bottom:8px;width:2px;background:var(--bs);border-radius:2px}
.tl>div{position:relative;margin-bottom:12px}
.tl>div::before{content:'';position:absolute;left:-20px;top:26px;width:10px;height:10px;border-radius:50%;background:var(--hero2);box-shadow:0 0 0 3px var(--stage)}
.evcard{display:flex;gap:14px;align-items:flex-start}
.tic{width:42px;height:42px;min-width:42px;border-radius:50%;display:grid;place-items:center}
.tic.sm{width:34px;height:34px;min-width:34px}
.evmain{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0}
.evmain b{font-size:14px}
.evwhen{font-size:11.5px;color:var(--ink3);font-weight:700}
.evdesc{font-size:12.5px;color:var(--ink2);font-weight:600}
.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ell2{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.evbadges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.epcard{display:flex;align-items:center;gap:14px;margin-top:16px}
.eptxt{flex:1;display:flex;flex-direction:column}
.eptxt b{font-size:14.5px}.eptxt span{font-size:12px;color:var(--ink2);font-weight:700}
.epic{width:44px;height:44px;border-radius:16px;background:linear-gradient(145deg,#68A4FF,#2F74D8);display:grid;place-items:center;color:#fff;box-shadow:inset 0 1px 1px rgba(255,255,255,.5)}
.qchips{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
/* chat */
.chead{display:flex;align-items:center;gap:10px;padding:18px 26px;border-bottom:1px solid var(--bs)}
.ctitle{font-weight:800;font-size:15px;letter-spacing:-0.02em}
.csub{font-size:11.5px;color:var(--ink3);font-weight:700}
.chead .hpill.dark{margin-left:auto}
.msgs{flex:1;overflow-y:auto;padding:24px 26px;display:flex;flex-direction:column;gap:14px}
.empty{flex:1;display:grid;place-items:center;text-align:center}
.empty h1{margin:18px 0 10px}
.esub{color:var(--ink2);font-size:14px;font-weight:600;max-width:420px;margin:0 auto 20px}
.qrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.brow{display:flex;gap:10px;max-width:760px}
.brow.user{align-self:flex-end}
.brow.ai{align-self:flex-start}
.aav{width:32px;height:32px;min-width:32px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:1px solid var(--bl);box-shadow:var(--sh1)}
.bubble{background:var(--card);border:1px solid var(--bl);border-radius:20px 20px 20px 6px;padding:13px 16px;font-size:14px;font-weight:600;line-height:1.55;box-shadow:var(--sh1), inset 0 1px 1px rgba(255,255,255,.5)}
.bubble.userb{background:linear-gradient(180deg,#2a2d32,#111315);color:#fff;border-radius:20px 20px 6px 20px;border-color:rgba(255,255,255,.14);box-shadow:0 8px 18px rgba(0,0,0,.22), inset 0 1px 1px rgba(255,255,255,.3)}
.memchip{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;color:var(--hero2);background:rgba(71,134,239,.1);border:1px solid rgba(71,134,239,.25);padding:4px 10px;border-radius:999px;margin-bottom:8px}
.macts{display:flex;gap:14px;margin-top:8px}
.macts button{font-size:11px;font-weight:800;color:var(--ink3)}
.macts button:hover{color:var(--ink)}
.sysrow{display:flex;justify-content:center}
.syschip{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:800;color:var(--ink2);background:var(--card);border:1px solid var(--bs);padding:7px 14px;border-radius:999px;box-shadow:var(--sh1)}
.caret{color:var(--hero2);animation:blink 1s infinite}
@keyframes blink{50%{opacity:0}}
.tdots{display:inline-flex;gap:4px;padding:4px 2px}
.tdots i{width:7px;height:7px;border-radius:50%;background:var(--ink3);animation:tb 1.1s infinite}
.tdots i:nth-child(2){animation-delay:.15s}.tdots i:nth-child(3){animation-delay:.3s}
@keyframes tb{30%{transform:translateY(-4px);opacity:.5}}
.composer{display:flex;gap:10px;align-items:center;padding:16px 22px;border-top:1px solid var(--bs)}
.cinput{flex:1;background:var(--card);border:1px solid var(--bl);border-radius:999px;padding:13px 20px;font-size:14px;font-weight:600;outline:none;box-shadow:inset 0 1px 2px rgba(255,255,255,.5);color:var(--ink)}
.cinput:focus{border-color:var(--hero2)}
.send{width:50px;height:50px;padding:0;border-radius:50%}
/* health */
.actrow{display:flex;gap:10px;align-items:center;margin-top:18px;flex-wrap:wrap}
.factrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--bs)}
.factrow:last-child{border-bottom:none}
.factrow .small{width:86px;min-width:86px;color:var(--ink3)}
.factrow b{flex:1;font-size:13px}
.minirow{display:flex;gap:11px;align-items:center;padding:9px 0;border-bottom:1px solid var(--bs);width:100%;text-align:left}
.minirow:last-child{border-bottom:none}
.minirow b{font-size:13px;display:block}
.small{font-size:12.5px;color:var(--ink2);font-weight:600;line-height:1.5}
.small.block{display:block}
.link{font-size:11.5px;font-weight:800;color:var(--ink2);text-decoration:underline dotted}
.link:hover{color:var(--ink)}
.vitalhead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.vnum{font-size:30px;letter-spacing:-0.03em}
/* docs */
.doccard{display:flex;gap:14px;align-items:flex-start}
.preview{background:var(--shell);border:1px solid var(--bs);border-radius:18px;padding:22px;margin-bottom:16px;display:flex;flex-direction:column;gap:10px}
.pvline{height:10px;border-radius:6px;background:var(--bs);width:100%}
.pvline.w60{width:60%}.pvline.w80{width:80%}.pvline.w40{width:40%}
.kv{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bs);font-size:12.5px}
.kv span{color:var(--ink3);font-weight:700}
.kv b{font-size:12.5px;text-align:right}
/* sharing */
.leasetop{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.leasetop .badge{margin-left:auto}
.otp{font-size:22px;letter-spacing:.06em;display:block;margin:4px 0 8px}
.qrwrap{display:flex;gap:16px;align-items:center;margin-bottom:14px}
/* auth gate popup */
.gatelock{width:64px;height:64px;border-radius:50%;margin:6px auto 14px;display:grid;place-items:center;
  background:linear-gradient(145deg,#68A4FF,#2F74D8);color:#fff;box-shadow:inset 0 1px 1px rgba(255,255,255,.5), 0 10px 24px rgba(47,116,216,.35)}
/* auth page */
.authstage{min-height:100vh;display:grid;place-items:center;padding:20px;position:relative;
  background:radial-gradient(circle at 50% 24%, var(--bl), transparent 58%) var(--stage)}
.authback{position:absolute;top:18px;left:18px;display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:13px;color:var(--ink2);
  background:var(--card);border:1px solid var(--bl);border-radius:999px;padding:10px 16px;box-shadow:var(--sh1)}
.authback:hover{color:var(--ink)}
.authshell{width:min(460px,94vw);background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:32px;
  box-shadow:var(--sh3), inset 0 1px 1px rgba(255,255,255,.4);padding:28px 26px;display:flex;flex-direction:column;gap:12px}
.authbrand{display:flex;justify-content:center}
.authshell .display.sm{text-align:center}
.authshell .esub{text-align:center}
.authseg{position:relative;display:grid;grid-template-columns:1fr 1fr;background:var(--card);border:1px solid var(--bl);border-radius:999px;padding:4px;margin-top:6px}
.authseg button{position:relative;z-index:1;padding:11px 0;border-radius:999px;font-weight:800;font-size:13px;color:var(--ink2);transition:color .2s}
.authseg button.on{color:#fff}
.authseg .thumb{position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;
  background:linear-gradient(180deg,#242424,#0d0d0d);box-shadow:0 6px 12px rgba(0,0,0,.25), inset 0 1px 1px rgba(255,255,255,.25)}
.authscroll{overflow:hidden}
.authtrack{display:flex;width:200%}
.authpanel{width:50%;display:flex;flex-direction:column;gap:10px;padding:6px 2px 2px}
.flabel{font-size:10.5px;font-weight:800;color:var(--ink3);letter-spacing:.08em}
.authnote{display:flex;align-items:center;gap:8px;justify-content:center;margin-top:4px;text-align:center}
.authdemo{color:var(--ink3)}
/* settings */
.setgrid{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.setgrid .pills{margin-top:0}
@media(max-width:900px){.setgrid{grid-template-columns:1fr}}
.tarea{width:100%;min-height:84px;background:var(--shell);border:1px solid var(--bs);border-radius:16px;padding:12px 14px;font-size:13px;font-weight:600;outline:none;margin:8px 0 10px;resize:vertical;color:var(--ink)}
/* wizard */
.steps{display:flex;gap:6px;margin-bottom:16px}
.steps i{height:5px;flex:1;border-radius:99px;background:var(--bs)}
.steps i.on{background:linear-gradient(90deg,#68A4FF,#2F74D8)}
.optlist{display:flex;flex-direction:column;gap:9px}
.opt{display:flex;align-items:center;gap:11px;padding:13px 16px;border-radius:18px;background:var(--card);border:1px solid var(--bl);font-weight:800;font-size:13.5px;box-shadow:var(--sh1);text-align:left}
.opt.on{border-color:var(--hero2);box-shadow:0 0 0 3px rgba(71,134,239,.15)}
.opt.locked{color:var(--ink3);box-shadow:none;background:transparent;border-style:dashed;cursor:not-allowed}
/* clinician */
.pheader{display:flex;gap:14px;align-items:center;margin-bottom:16px}
.leasepill{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,#242424,#0d0d0d);color:#fff;border-radius:999px;padding:9px 15px;font-size:12px;font-weight:800;box-shadow:0 6px 12px rgba(0,0,0,.22)}
.cgrid{display:grid;grid-template-columns:1fr 1.15fr 1.15fr;gap:16px;align-items:start}
@media(max-width:1200px){.cgrid{grid-template-columns:1fr}}
.briefsec{padding:9px 0;border-bottom:1px solid var(--bs)}
.briefsec .link{display:inline-block;margin-top:4px}
.suprow{display:flex;align-items:center;gap:10px;margin:8px 0}
.supbar{flex:1;height:7px;border-radius:99px;background:var(--bs);overflow:hidden}
.supbar i{display:block;height:100%;background:linear-gradient(90deg,#68A4FF,#2F74D8);border-radius:99px}
.vrow{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-bottom:1px solid var(--bs)}
.feed{display:flex;flex-direction:column;gap:10px;margin:10px 0}
.feeditem{background:var(--shell);border:1px solid var(--bs);border-radius:16px;padding:10px 12px}
.ctoolbar{display:none}
/* overlays */
.scrim{position:fixed;inset:0;background:rgba(15,15,15,.35);backdrop-filter:blur(6px);z-index:60}
.scrim.modal{display:grid;place-items:center;padding:20px}
.drawer{position:fixed;top:14px;right:14px;bottom:14px;width:min(440px,94vw);z-index:70;background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:28px;box-shadow:var(--sh3);display:flex;flex-direction:column;overflow:hidden}
.drawer .scroll{height:auto;flex:1}
.panel{max-height:86vh;overflow:auto;background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:28px;box-shadow:var(--sh3);padding:22px}
.dhead{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--bs)}
.quote{background:var(--shell);border-left:3px solid var(--hero2);border-radius:12px;padding:11px 14px;font-size:12.5px;font-weight:600;color:var(--ink2);margin:6px 0 14px}
.chain{display:flex;gap:10px;align-items:center;padding:6px 0}
.chaindot{width:9px;height:9px;border-radius:50%;min-width:9px}
.evhead{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.cmdlist{display:flex;flex-direction:column;gap:3px}
/* toasts */
.toasts{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:10px;z-index:100;align-items:center}
.toast{display:flex;gap:10px;align-items:center;background:linear-gradient(180deg,#242424,#0d0d0d);color:#fff;padding:12px 20px;border-radius:999px;font-size:13px;font-weight:800;box-shadow:0 10px 24px rgba(0,0,0,.28), inset 0 1px 1px rgba(255,255,255,.25)}
/* switch */
.sw{width:46px;height:28px;border-radius:999px;background:var(--shell);border:1px solid var(--bs);position:relative;cursor:pointer;transition:.2s;min-width:46px}
.sw.on{background:linear-gradient(145deg,#68A4FF,#2F74D8);border-color:transparent}
.sw i{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:.2s}
.sw.on i{left:20px}

/* ═══════════ DARK THEME — layered near-black player aesthetic ═══════════ */
.app[data-theme='dark']{
  --stage:#0E0E10; --shell:#191A1C; --shell2:#1F2023; --card:#28292C;
  --ink:#F4F4F5; --ink2:#A8A8AD; --ink3:#77777C;
  --bl:rgba(255,255,255,.10); --bs:rgba(255,255,255,.06);
  --sh1:0 3px 10px rgba(0,0,0,.35); --sh2:0 8px 20px rgba(0,0,0,.4); --sh3:0 24px 50px rgba(0,0,0,.55);
  --green:#4CC38A; --amber:#E0A83F; --red:#E5695E;
}
.app[data-theme='dark'] .stage,.app[data-theme='dark'] .authstage{background:radial-gradient(circle at 50% 16%, rgba(255,255,255,.05), transparent 55%) var(--stage)}
.app[data-theme='dark'] .side,.app[data-theme='dark'] .main,.app[data-theme='dark'] .drawer-left,
.app[data-theme='dark'] .drawer,.app[data-theme='dark'] .panel,.app[data-theme='dark'] .topbar,.app[data-theme='dark'] .authshell{
  background:linear-gradient(180deg,var(--shell2),var(--shell));border-color:var(--bl)}
.app[data-theme='dark'] .authshell{box-shadow:var(--sh3), inset 0 1px 1px rgba(255,255,255,.06)}
.app[data-theme='dark'] .nav.on{background:#3C3D42;border-color:rgba(255,255,255,.14);box-shadow:0 2px 10px rgba(0,0,0,.4)}
.app[data-theme='dark'] .nav:hover{background:#26272A}
.app[data-theme='dark'] .prow:hover,.app[data-theme='dark'] .dx:hover{background:#26272A}
.app[data-theme='dark'] .btn.soft{background:linear-gradient(180deg,#2F3034,#26272B);box-shadow:0 3px 10px rgba(0,0,0,.4), inset 0 1px 1px rgba(255,255,255,.07)}
.app[data-theme='dark'] .btn.icon{background:#2F3034;box-shadow:0 3px 10px rgba(0,0,0,.4), inset 0 1px 1px rgba(255,255,255,.06)}
.app[data-theme='dark'] .btn.dark{border-color:rgba(255,255,255,.2);box-shadow:0 8px 18px rgba(0,0,0,.55), inset 0 1px 1px rgba(255,255,255,.22)}
.app[data-theme='dark'] .pill{background:#26272B;box-shadow:0 2px 8px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.05)}
.app[data-theme='dark'] .pill.on{background:#3C3D42;border-color:rgba(255,255,255,.16);box-shadow:0 4px 12px rgba(0,0,0,.45)}
.app[data-theme='dark'] .card{box-shadow:0 8px 20px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.05)}
.app[data-theme='dark'] button.card:hover{box-shadow:0 12px 26px rgba(0,0,0,.5)}
.app[data-theme='dark'] .card.inset{background:transparent;box-shadow:none}
.app[data-theme='dark'] .bubble{box-shadow:0 4px 12px rgba(0,0,0,.3), inset 0 1px 1px rgba(255,255,255,.05)}
.app[data-theme='dark'] .bubble.userb{background:linear-gradient(180deg,#45464B,#333439);border-color:rgba(255,255,255,.14)}
.app[data-theme='dark'] .aav,.app[data-theme='dark'] .syschip{background:var(--card)}
.app[data-theme='dark'] .searchpill{border-color:rgba(255,255,255,.16)}
.app[data-theme='dark'] .cinput{background:#232428;box-shadow:none}
.app[data-theme='dark'] .tarea{background:#232428}
.app[data-theme='dark'] .preview{background:#232428}
.app[data-theme='dark'] .feeditem{background:#232428}
.app[data-theme='dark'] .quote{background:#232428}
.app[data-theme='dark'] .hpill.dark{background:#2C2D31;color:var(--ink2)}
.app[data-theme='dark'] .badge{background:#2E2F33}
.app[data-theme='dark'] .opt{background:#26272B}
.app[data-theme='dark'] .opt.locked{background:transparent}
.app[data-theme='dark'] .sw{background:#333438}
.app[data-theme='dark'] .toast{background:linear-gradient(180deg,#26262A,#151517);border:1px solid rgba(255,255,255,.14)}
.app[data-theme='dark'] .leasepill{border:1px solid rgba(255,255,255,.2)}
.app[data-theme='dark'] .scrim{background:rgba(0,0,0,.55)}
.app[data-theme='dark'] .brand .clinlab{color:#8CC9FF}
.app[data-theme='dark'] .memchip{color:#8CC9FF;background:rgba(71,134,239,.16)}
.app[data-theme='dark'] .av{border-color:rgba(255,255,255,.85)}
.app[data-theme='dark'] .tl>div::before{box-shadow:0 0 0 3px var(--stage)}
.app[data-theme='dark'] .hero{box-shadow:inset 0 1px 1px rgba(255,255,255,.5), 0 16px 40px rgba(0,0,0,.5)}
.app[data-theme='dark'] .ctoolbar{background:linear-gradient(180deg,var(--shell2),var(--shell));border-color:var(--bl)}
.app[data-theme='dark'] .ctoolbar button:active{background:#2C2D31}
.app[data-theme='dark'] .authseg{background:#232428}
.app[data-theme='dark'] .authseg .thumb{background:#3C3D42;border:1px solid rgba(255,255,255,.14)}
.app[data-theme='dark'] .authback{background:#26272B}

/* ── responsive ── */
@media(max-width:980px){
  .topbar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:20px;box-shadow:var(--sh2);position:sticky;top:12px;z-index:40}
  .tbtitle{flex:1;text-align:center;font-weight:800;font-size:15px;letter-spacing:-0.02em}
  .stage{grid-template-columns:1fr;padding:12px;gap:12px}
  .side{display:none}
  .main{min-height:calc(100vh - 96px)}
  .scroll{padding:20px 16px 96px}
  .msgs{padding:16px 14px}
  .composer{padding:12px}
  .grid2,.grid3{grid-template-columns:1fr}
  .chead{padding:14px 16px}
  .ctoolbar{display:flex;position:fixed;bottom:12px;left:12px;right:12px;z-index:45;background:linear-gradient(180deg,var(--shell2),var(--shell));border:1px solid var(--bl);border-radius:24px;box-shadow:var(--sh3);justify-content:space-around;padding:8px}
  .ctoolbar button{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:800;color:var(--ink2);padding:8px 16px;border-radius:16px}
  .ctoolbar button:active{background:var(--card);color:var(--ink)}
}
`;
