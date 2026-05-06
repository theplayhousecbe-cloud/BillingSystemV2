// Local persistence layer. Supabase provides live sync; localStorage is the local cache.
import type { Session, Staff } from "./types";
import { supabase } from "./supabase";

const KEYS = {
  staff: "ph_staff",
  sessions: "ph_sessions",
  theme: "ph_theme",
  tables: "ph_tables",
};

// ──────────────────────────────────────────────
// Supabase Realtime: subscribe to the "app_data" table, row id = "sessions"
// Table schema:  id (text, PK) | data (jsonb) | updated_at (timestamptz)
// ──────────────────────────────────────────────
if (typeof window !== "undefined") {
  // 1. Initial fetch
  supabase
    .from("app_data")
    .select("data")
    .eq("id", "sessions")
    .maybeSingle()
    .then(({ data }) => {
      if (data?.data?.list) {
        localStorage.setItem(KEYS.sessions, JSON.stringify(data.data.list));
        window.dispatchEvent(new CustomEvent("ph_sessions_changed"));
      }
    });

  // 2. Realtime subscription
  supabase
    .channel("app_data_sessions")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_data",
        filter: "id=eq.sessions",
      },
      (payload: any) => {
        const newData = payload.new?.data;
        if (newData?.list) {
          localStorage.setItem(KEYS.sessions, JSON.stringify(newData.list));
          window.dispatchEvent(new CustomEvent("ph_sessions_changed"));
        }
      }
    )
    .subscribe();
}

export const storage = {
  getStaff(): Staff | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(KEYS.staff);
    return raw ? JSON.parse(raw) : null;
  },
  setStaff(s: Staff | null) {
    if (s) localStorage.setItem(KEYS.staff, JSON.stringify(s));
    else localStorage.removeItem(KEYS.staff);
  },
  getSessions(): Session[] {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(KEYS.sessions);
    return raw ? JSON.parse(raw) : [];
  },
  setSessions(list: Session[]) {
    // 1. Update local immediately for snappy UI
    localStorage.setItem(KEYS.sessions, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("ph_sessions_changed"));

    // 2. Sync to Supabase (upsert the single "sessions" row)
    try {
      supabase
        .from("app_data")
        .upsert(
          { id: "sessions", data: { list }, updated_at: new Date().toISOString() },
          { onConflict: "id" }
        )
        .then(({ error }) => {
          if (error) console.error("Supabase sync error:", error.message);
        });
    } catch (error) {
      console.error("Supabase sync failed:", error);
    }
  },
  getTheme(): "light" | "dark" {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(KEYS.theme) as "light" | "dark") || "light";
  },
  setTheme(t: "light" | "dark") {
    localStorage.setItem(KEYS.theme, t);
  },
  getTables(): string[] {
    if (typeof window === "undefined") return ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const raw = localStorage.getItem(KEYS.tables);
    return raw ? JSON.parse(raw) : ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  },
  setTables(list: string[]) {
    localStorage.setItem(KEYS.tables, JSON.stringify(list));
    window.dispatchEvent(new Event("ph_tables_changed"));
  },
};
