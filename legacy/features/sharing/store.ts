import { toast } from "@/components/ui/toast-store";
import { create } from "zustand";
import type { AccessEntry, CreateLeaseInput, Lease } from "./types";

interface SharingState {
  leases: Lease[];
  accessLog: AccessEntry[];
  wizardOpen: boolean;
  leaseViewId: string | null;

  setWizardOpen: (v: boolean) => void;
  setLeaseViewId: (id: string | null) => void;

  createLease: (cfg: CreateLeaseInput) => void;
  revokeLease: (id: string) => void;
  logAccess: (actor: string, action: string, purpose?: string) => void;
}

const nowLabel = () => "Now";

export const useSharingStore = create<SharingState>((set, get) => ({
  leases: [],
  accessLog: [],
  wizardOpen: false,
  leaseViewId: null,

  setWizardOpen: (wizardOpen) => set({ wizardOpen }),
  setLeaseViewId: (leaseViewId) => set({ leaseViewId }),

  createLease(cfg) {
    if (cfg.scope.length === 0) {
      toast("Select at least one scope category", "alert");
      return;
    }
    const code = "MH-" + Math.floor(100000 + Math.random() * 899999);
    const lease: Lease = {
      id: "L-" + Math.floor(1000 + Math.random() * 8999),
      code,
      actor: "Attending Clinician",
      org: "Medical Practice",
      purpose: cfg.purpose,
      scope: cfg.scope,
      issuedAt: nowLabel(),
      expiresAt: Date.now() + cfg.minutes * 60000,
      status: "active",
    };
    set({
      leases: [lease, ...get().leases],
      wizardOpen: false,
      leaseViewId: lease.id,
      accessLog: [
        {
          actor: "Patient",
          action: `Created access lease ${lease.id}`,
          at: nowLabel(),
          purpose: cfg.purpose,
        },
        ...get().accessLog,
      ],
    });
    toast(`Access lease created · ${cfg.minutes} min`, "shield");
  },

  revokeLease(id) {
    set({
      leases: get().leases.map((l) =>
        l.id === id ? { ...l, status: "revoked" } : l,
      ),
      leaseViewId: null,
      accessLog: [
        {
          actor: "Patient",
          action: `Revoked lease ${id}`,
          at: nowLabel(),
          purpose: "Patient action",
        },
        ...get().accessLog,
      ],
    });
    toast("Lease revoked · access blocked", "lock");
  },

  logAccess(actor, action, purpose = "Consultation") {
    set({
      accessLog: [
        { actor, action, at: nowLabel(), purpose },
        ...get().accessLog,
      ],
    });
  },
}));
