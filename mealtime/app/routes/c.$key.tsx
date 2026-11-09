import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";

import { act, fmtDur, fmtTime, useKitchen, type PlanStep } from "@/lib/kitchen-client";

export function meta() {
  return [{ title: "Mealtime: your next step" }];
}

/** A cook's phone: only their next step, with a countdown. */
export default function CookPhone() {
  const { key = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { kitchen, clockOffset, error, loading } = useKitchen(key);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [busy, setBusy] = useState(false);

  if (loading) return <Shell>Loading…</Shell>;
  if (error || !kitchen) return <Shell>This cook link doesn't work. Ask the host for a new one.</Shell>;

  const cooks = kitchen.kitchenSetup.cooks;
  const me = params.get("as") && cooks.includes(params.get("as")!) ? params.get("as")! : null;
  if (!me) {
    return (
      <Shell>
        <p className="mb-4 text-lg font-semibold">Who's cooking on this phone?</p>
        <div className="flex flex-col gap-2">
          {cooks.map((c) => (
            <button key={c} type="button" className="rounded-lg border px-4 py-3 text-lg" onClick={() => setParams({ as: c })}>
              {c}
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  const mine = kitchen.plan.steps.filter((s) => s.assignedCook === me && s.state !== "done");
  const current = mine.find((s) => s.state === "running") ?? mine[0];
  const after = mine.filter((s) => s.id !== current?.id).slice(0, 3);
  const run = async (name: string, p: Record<string, unknown>) => {
    setBusy(true);
    try {
      await act(name, { kitchen: key, by: me, via: "phone", ...p });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <p className="text-xs text-muted-foreground">
        {me} · dinner at {fmtTime(kitchen.plan.projectedServeAt)}
        {kitchen.plan.slipMinutes ? ` (${kitchen.plan.slipMinutes} min late)` : ""}
      </p>
      {current ? (
        <StepCard step={current} now={now + clockOffset} units={kitchen.units} />
      ) : (
        <p className="mt-6 text-lg">Nothing left for you. Go set the table.</p>
      )}
      {current ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {current.state === "running" ? (
            <button type="button" disabled={busy} className="col-span-2 rounded-lg bg-foreground py-3 text-lg text-background" onClick={() => run("mark-step", { stepId: current.id, status: "done" })}>
              Done
            </button>
          ) : (
            <button type="button" disabled={busy} className="col-span-2 rounded-lg bg-foreground py-3 text-lg text-background" onClick={() => run("mark-step", { stepId: current.id, status: "start" })}>
              Start
            </button>
          )}
          {current.state === "running" ? (
            <>
              <button type="button" disabled={busy} className="rounded-lg border py-2" onClick={() => run("report-delay", { stepId: current.id, extraMinutes: 5 })}>
                Need 5 more min
              </button>
              <button type="button" disabled={busy} className="rounded-lg border py-2" onClick={() => run("report-delay", { stepId: current.id, extraMinutes: 10 })}>
                Need 10 more min
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {after.length ? (
        <div className="mt-6">
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">After that</p>
          <ul className="text-sm">
            {after.map((s) => (
              <li key={s.id} className="flex justify-between border-b py-1">
                <span>{s.label} <span className="text-muted-foreground">· {s.dishName}</span></span>
                <span className="text-muted-foreground">{fmtTime(s.start)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}

function StepCard({ step, now, units }: { step: PlanStep; now: number; units: string }) {
  const target = step.state === "running" ? step.end : step.start;
  const secs = Math.round((target - now) / 1000);
  const label = step.state === "running" ? (secs >= 0 ? "Done in" : "Over by") : secs >= 0 ? "Start in" : "Should have started";
  const abs = Math.abs(secs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const ss = String(abs % 60).padStart(2, "0");
  const clock = h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  return (
    <div className="mt-3 rounded-xl border p-4">
      <p className="text-xs uppercase text-muted-foreground">{step.dishName}</p>
      <h1 className="text-2xl font-semibold leading-tight">{step.label}</h1>
      <p className="text-sm text-muted-foreground">
        {fmtDur(step.minutes)}
        {step.need === "oven" ? ` · oven ${step.temp ?? "?"}°${units}` : step.need === "burner" ? " · stovetop" : ""}
      </p>
      <p className={`mt-3 text-4xl font-semibold tabular-nums ${secs < 0 ? "text-red-600" : ""}`}>
        <span className="block text-xs font-normal text-muted-foreground">{label}</span>
        {clock}
      </p>
      {step.quote ? <p className="mt-2 text-xs text-muted-foreground">Recipe: “{step.quote}”</p> : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md p-4">{children}</main>;
}
