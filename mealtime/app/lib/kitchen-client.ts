import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { Approval, LogEntry, Plan, PlanStep } from "../../server/lib/kitchen";

export type { Approval, LogEntry, Plan, PlanStep };

export interface KitchenView {
  role: "host" | "cook";
  version: number;
  now: number;
  clockOffsetMin: number;
  cookKey?: string;
  title: string;
  units: "F" | "C";
  kitchenSetup: { ovens: number; ovenSlots: number; burners: number; tempTolerance: number; cooks: string[] };
  dishes: { id: string; name: string; sourceUrl?: string; site?: string; stated?: { prep?: number; cook?: number; total?: number }; status: string; instructionCount: number }[];
  approvals: Approval[];
  log: LogEntry[];
  plan: Plan;
}

/** The kitchen, kept fresh: phones poll a tiny version number and refetch on change. */
export function useKitchen(key: string) {
  const qc = useQueryClient();
  const q = useActionQuery("get-kitchen", { kitchen: key } as never, { refetchOnWindowFocus: true } as never);
  const data = q.data as unknown as KitchenView | undefined;
  const seen = useRef<number | undefined>(undefined);
  seen.current = data?.version;
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const r = (await callAction("get-kitchen-version", { kitchen: key } as never)) as unknown as { version: number };
        if (seen.current !== undefined && r.version !== seen.current) {
          await qc.invalidateQueries({ queryKey: ["action", "get-kitchen"] });
          await q.refetch();
        }
      } catch {
        /* offline for a moment; try again next tick */
      }
    };
    const id = setInterval(tick, 2500);
    const now = () => void q.refetch();
    window.addEventListener(CHANGED, now);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener(CHANGED, now);
    };
  }, [key, qc, q]);
  // Server clock (including the demo clock) minus this browser's clock.
  const clockOffset = data ? data.now - (q.dataUpdatedAt || Date.now()) : 0;
  return { kitchen: data, clockOffset, error: q.error as Error | null, loading: q.isLoading, refetch: q.refetch };
}

const CHANGED = "mealtime:changed";

/** Run an action, then refresh this page at once instead of waiting for the poll. */
export async function act(name: string, params: Record<string, unknown>) {
  try {
    return await callAction(name as never, params as never);
  } finally {
    window.dispatchEvent(new Event(CHANGED));
  }
}

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDur(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
