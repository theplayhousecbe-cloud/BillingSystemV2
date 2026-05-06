import { useEffect, useMemo, useState } from "react";
import { UserCheck, UserX } from "lucide-react";
import { sessionsApi } from "@/lib/sessions";
import type { Session } from "@/lib/types";

// Keep in sync with the default roster used in /new.
const DEFAULT_HOSTS = ["Sanjay", "Priya", "Rahul", "Sneha", "Vikram", "Neha"];

interface HostInfo {
  name: string;
  busy: boolean;
  tables: string[];
  customers: string[];
}

export function HostStatus() {
  const [active, setActive] = useState<Session[]>([]);
  useEffect(() => {
    const refresh = () => setActive(sessionsApi.active());
    refresh();
    window.addEventListener("ph_sessions_changed", refresh);
    return () => window.removeEventListener("ph_sessions_changed", refresh);
  }, []);

  const hosts: HostInfo[] = useMemo(() => {
    const map = new Map<string, HostInfo>();
    // Seed roster with defaults so they always appear (as free if not assigned).
    DEFAULT_HOSTS.forEach((n) =>
      map.set(n, { name: n, busy: false, tables: [], customers: [] }),
    );
    // Fold in any host currently attending an active session.
    for (const s of active) {
      const names = (s.hosts && s.hosts.length > 0 ? s.hosts : [s.staffName]).filter(Boolean);
      for (const raw of names) {
        const name = raw.trim();
        if (!name) continue;
        const existing = map.get(name) ?? { name, busy: false, tables: [], customers: [] };
        existing.busy = true;
        existing.tables.push(...s.tableIds);
        existing.customers.push(s.customerName);
        map.set(name, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [active]);

  const busyCount = hosts.filter((h) => h.busy).length;
  const freeCount = hosts.length - busyCount;

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Hosts</h2>
          <p className="text-xs text-muted-foreground">
            Who's on the floor right now
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 font-medium text-primary">
            <UserCheck className="h-3.5 w-3.5" /> {busyCount} busy
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 font-medium text-success">
            <UserX className="h-3.5 w-3.5" /> {freeCount} free
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {hosts.map((h) => (
          <div
            key={h.name}
            className={`glass rounded-2xl p-4 transition ${
              h.busy ? "ring-1 ring-primary/40" : "opacity-90"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    h.busy
                      ? "bg-primary/20 text-primary"
                      : "bg-success/20 text-success"
                  }`}
                >
                  {h.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">{h.name}</div>
                  <div
                    className={`text-[11px] font-medium ${
                      h.busy ? "text-primary" : "text-success"
                    }`}
                  >
                    {h.busy ? "Busy" : "Free"}
                  </div>
                </div>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  h.busy ? "bg-primary animate-pulse" : "bg-success"
                }`}
              />
            </div>

            {h.busy && (
              <div className="mt-3 space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(h.tables)).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {Array.from(new Set(h.customers)).join(", ")}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
