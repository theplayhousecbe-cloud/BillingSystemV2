// Billing engine — per-person rule.
// Every person has their own joinedAt (and optional leftAt). For each person:
//   • first 60 minutes of THEIR presence is billed at their `firstHourRate`
//   • every minute beyond that is billed at the session's `subsequentRate`
// All amounts are pro-rated to the SECOND (exact, no rounding of time).
//
// If a session has no `persons` array (legacy data), we synthesise one from
// `adults` + `kids` + `pricing.memberRates` so old sessions still bill correctly.

import type { Bill, BillLine, Person, Session } from "./types";
import { MENU_ITEMS } from "./types";

const MS_PER_SEC = 1_000;
const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 3_600_000;
const round = (n: number) => Math.round(n * 100) / 100;

/** Format seconds as "Xh Ym Zs" for receipt labels */
function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / MS_PER_SEC);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

export function ensurePersons(s: Session): Person[] {
  if (s.persons && s.persons.length) return s.persons;
  const persons: Person[] = [];
  const rates = s.pricing.memberRates ?? [];
  for (let i = 0; i < s.adults; i++) {
    persons.push({
      id: `p-${i}`,
      label: String.fromCharCode(65 + i),
      kind: "adult",
      joinedAt: s.startedAt,
      firstHourRate: rates[i] ?? s.pricing.adultRate,
    });
  }
  for (let j = 0; j < s.kids; j++) {
    const i = s.adults + j;
    persons.push({
      id: `p-${i}`,
      label: String.fromCharCode(65 + i),
      kind: "kid",
      joinedAt: s.startedAt,
      firstHourRate: rates[i] ?? s.pricing.kidRate,
    });
  }
  return persons;
}

export interface PersonCharge {
  person: Person;
  presentMs: number;       // exact milliseconds present
  presentMin: number;      // exact fractional minutes (for legacy compat)
  firstHourMs: number;     // ms billed at first-hour rate
  extraMs: number;         // ms billed at subsequent rate
  firstHourMin: number;
  extraMin: number;
  firstHourAmt: number;
  extraAmt: number;
  total: number;
}

export function chargeForPerson(p: Person, sessionEnd: number, subsequentRate: number): PersonCharge {
  const end = Math.min(p.leftAt ?? sessionEnd, sessionEnd);
  const presentMs = Math.max(0, end - p.joinedAt);

  // Split at exactly 1 hour (3 600 000 ms) — no rounding
  const firstHourMs = Math.min(MS_PER_HOUR, presentMs);
  const extraMs = Math.max(0, presentMs - MS_PER_HOUR);

  // Amounts: divide by MS_PER_HOUR for exact fractional hours
  const firstHourAmt = round((firstHourMs / MS_PER_HOUR) * p.firstHourRate);
  const extraAmt = round((extraMs / MS_PER_HOUR) * subsequentRate);

  // Keep minute fields for any legacy callers
  const presentMin = presentMs / MS_PER_MIN;
  const firstHourMin = firstHourMs / MS_PER_MIN;
  const extraMin = extraMs / MS_PER_MIN;

  return {
    person: p,
    presentMs,
    presentMin,
    firstHourMs,
    extraMs,
    firstHourMin,
    extraMin,
    firstHourAmt,
    extraAmt,
    total: round(firstHourAmt + extraAmt),
  };
}

export function computeBill(s: Session, endedAt: number = Date.now()): Bill {
  const persons = ensurePersons(s);
  const sessionEnd = Math.min(endedAt, s.endedAt ?? endedAt);
  const subsequent = s.pricing.subsequentRate ?? 99;

  const lines: BillLine[] = [];
  const charges = persons.map((p) => chargeForPerson(p, sessionEnd, subsequent));

  for (const c of charges) {
    if (c.presentMs <= 0) continue;

    // qty: exact fractional hours (NOT rounded to 2dp) — so receipt math is consistent
    const qty = c.presentMs / MS_PER_HOUR;

    // Label: show human-readable exact duration instead of rounded hours
    const desc =
      c.extraMs > 0
        ? `Person ${c.person.label} (1h@₹${c.person.firstHourRate} + ${fmtDuration(c.extraMs)}@₹${subsequent})`
        : `Person ${c.person.label} (${fmtDuration(c.presentMs)})`;

    lines.push({
      label: desc,
      qty,                          // exact — no toFixed/round on qty
      rate: subsequent,
      amount: c.total,              // amount is always the source of truth
    });
  }

  if (s.menuOrders) {
    for (const [itemId, qty] of Object.entries(s.menuOrders)) {
      if (!qty || qty <= 0) continue;
      const item = MENU_ITEMS.find((m) => m.id === itemId);
      if (!item) continue;
      lines.push({
        label: item.label,
        qty,
        rate: item.price,
        amount: round(qty * item.price),
      });
    }
  }

  const subtotal = round(lines.reduce((a, l) => a + l.amount, 0));
  const totalMs = Math.max(0, sessionEnd - s.startedAt);

  return {
    sessionId: s.id,
    customerName: s.customerName,
    customerMobile: s.customerMobile,
    tables: s.tableIds,
    startedAt: s.startedAt,
    endedAt: sessionEnd,
    durationMin: round(totalMs / MS_PER_MIN),
    lines,
    subtotal,
    total: subtotal,
  };
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// helper exported for UI summaries
export function summarisePersons(s: Session, now: number = Date.now()) {
  const persons = ensurePersons(s);
  const subsequent = s.pricing.subsequentRate ?? 99;
  return persons.map((p) => ({
    ...chargeForPerson(p, Math.min(now, s.endedAt ?? now), subsequent),
    active: !p.leftAt,
  }));
}