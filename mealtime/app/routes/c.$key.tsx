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
        <span className="mt-eyebrow" style={{ marginTop: 24 }}><span className="dot" />Mealtime</span>
        <p className="mt-h1" style={{ fontSize: 30 }}>Who's cooking on this phone?</p>
        <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
          {cooks.map((c) => (
            <button key={c} type="button" className="mt-btn mt-btn--lg" style={{ justifyContent: "flex-start" }} onClick={() => setParams({ as: c })}>
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
      <div className="mt-cook__top">
        <span className="mt-eyebrow"><span className="dot" />{me}</span>
        <span>
          Dinner <b className="mt-mono">{fmtTime(kitchen.plan.projectedServeAt)}</b>
          {kitchen.plan.slipMinutes ? <span style={{ color: "var(--mt-late)" }}> · {kitchen.plan.slipMinutes} min late</span> : null}
        </span>
      </div>
      {current ? (
        <StepCard step={current} now={now + clockOffset} units={kitchen.units} />
      ) : (
        <div className="mt-stepcard"><p className="mt-h1" style={{ fontSize: 26 }}>Nothing left for you.</p><p className="mt-sub">Go set the table.</p></div>
      )}
      {current ? (
        <div className="grid grid-cols-2 gap-2">
          {current.state === "running" ? (
            <button type="button" disabled={busy} className="mt-btn mt-btn--ink mt-btn--lg col-span-2" onClick={() => run("mark-step", { stepId: current.id, status: "done" })}>
              Done
            </button>
          ) : (
            <button type="button" disabled={busy} className="mt-btn mt-btn--ink mt-btn--lg col-span-2" onClick={() => run("mark-step", { stepId: current.id, status: "start" })}>
              Start
            </button>
          )}
          {current.state === "running" ? (
            <>
              <button type="button" disabled={busy} className="mt-btn" onClick={() => run("report-delay", { stepId: current.id, extraMinutes: 5 })}>
                Need 5 more min
              </button>
              <button type="button" disabled={busy} className="mt-btn" onClick={() => run("report-delay", { stepId: current.id, extraMinutes: 10 })}>
                Need 10 more min
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {after.length ? (
        <div className="mt-card" style={{ padding: "14px 18px" }}>
          <p className="mt-eyebrow">After that</p>
          <ul className="mt-next" style={{ marginTop: 4 }}>
            {after.map((s) => (
              <li key={s.id}>
                <span><b style={{ fontWeight: 650 }}>{s.label}</b> <span style={{ color: "var(--mt-ink-3)" }}>· {s.dishName}</span></span>
                <span className="mt-mono" style={{ color: "var(--mt-ink-3)" }}>{fmtTime(s.start)}</span>
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
    <div className="mt-stepcard">
      <p className="mt-eyebrow">{step.dishName}</p>
      <h1>{step.label}</h1>
      <p className="text-sm" style={{ color: "var(--mt-ink-3)" }}>
        {fmtDur(step.minutes)}
        {step.need === "oven" ? ` · oven ${step.temp ?? "?"}°${units}` : step.need === "burner" ? " · stovetop" : ""}
      </p>
      <p className={`mt-count ${secs < 0 ? "mt-count--over" : ""}`}>
        <span className="mt-count-label">{label}</span>
        {clock}
      </p>
      {step.quote ? <p className="mt-quote" style={{ fontSize: 13 }}>From the recipe: <q style={{ fontSize: 16 }}>{step.quote}</q></p> : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mt-app mt-cook">{children}</main>;
}
