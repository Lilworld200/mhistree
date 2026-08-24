"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { KvRow } from "@/components/ui/fact-row";
import { MicroLabel } from "@/components/ui/label";
import { OverlayShell } from "@/components/ui/overlay-shell";
import { CLINICIAN } from "@/lib/demo/people";
import { LEASE_PURPOSES, SCOPE_OPTIONS } from "../types";
import { useSharingStore } from "../store";

const PURPOSE_ICONS: Record<string, Parameters<typeof Icon>[0]["n"]> = {
  Emergency: "alert",
  "Claims / HMO": "doc",
};

export function ShareWizard() {
  const open = useSharingStore((s) => s.wizardOpen);
  const setWizardOpen = useSharingStore((s) => s.setWizardOpen);
  const createLease = useSharingStore((s) => s.createLease);
  const close = () => setWizardOpen(false);

  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<string>("Consultation");
  const [scope, setScope] = useState<string[]>([...SCOPE_OPTIONS]);
  const [mins, setMins] = useState(30);

  // Reset the wizard each time it opens (render-time state adjustment).
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setStep(0);
    setScope([...SCOPE_OPTIONS]);
    setPurpose("Consultation");
    setMins(30);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const scopeInvalid = step === 1 && scope.length === 0;

  return (
    <OverlayShell
      variant="center"
      width={560}
      open={open}
      onClose={close}
      title="Share health information"
    >
      <div className="dhead" style={{ padding: 0, marginBottom: 14, borderBottom: "none" }}>
        <b className="ptitle-sm">Share health information</b>
        <MicroLabel>
          STEP {step + 1} / 4
        </MicroLabel>
      </div>

      <div className="steps" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -26 }}
          transition={{ duration: 0.22 }}
        >
          {step === 0 && (
            <div className="optlist">
              {LEASE_PURPOSES.map((p) => (
                <button
                  key={p}
                  className={`opt ${purpose === p ? "on" : ""}`}
                  onClick={() => setPurpose(p)}
                >
                  <Icon n={PURPOSE_ICONS[p] ?? "steth"} s={16} />
                  {p}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="optlist">
              {SCOPE_OPTIONS.map((sc) => {
                const on = scope.includes(sc);
                return (
                  <button
                    key={sc}
                    className={`opt ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      setScope(on ? scope.filter((x) => x !== sc) : [...scope, sc])
                    }
                  >
                    <Icon n={on ? "check" : "plus"} s={15} />
                    {sc}
                  </button>
                );
              })}
              <div className="opt opt-locked" aria-disabled="true">
                <Icon n="lock" s={15} />
                Personal context
                <span className="small">&nbsp;— excluded by design</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="pills" style={{ marginTop: 0 }}>
              {[15, 30, 60, 120].map((m) => (
                <button
                  key={m}
                  className={`pill ${mins === m ? "on" : ""}`}
                  onClick={() => setMins(m)}
                >
                  {m} minutes
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div>
              <KvRow k="To" v={`${CLINICIAN.name} · ${CLINICIAN.org}`} />
              <KvRow k="Purpose" v={purpose} />
              <KvRow k="Scope" v={`${scope.length} categories · Personal excluded`} />
              <KvRow k="Window" v={`${mins} minutes, then auto-expiry`} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {scopeInvalid && (
        <p className="small" style={{ color: "var(--red)", marginTop: 10 }}>
          Select at least one category to continue.
        </p>
      )}

      <div className="actrow" style={{ marginTop: 18, justifyContent: "space-between" }}>
        <Btn kind="soft" sm onClick={() => (step === 0 ? close() : setStep(step - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Btn>
        {step < 3 ? (
          <Btn kind="dark" sm disabled={scopeInvalid} onClick={() => setStep(step + 1)}>
            Continue
          </Btn>
        ) : (
          <Btn
            kind="dark"
            sm
            icon="shield"
            onClick={() => createLease({ purpose, scope, minutes: mins })}
          >
            Generate QR / OTP
          </Btn>
        )}
      </div>
    </OverlayShell>
  );
}
