import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Timeline } from "@/components/kitchen/Timeline";
import { act, fmtDur, fmtTime, useKitchen, type KitchenView, type PlanStep } from "@/lib/kitchen-client";
import { TAB_ID } from "@/lib/tab-id";

export function meta() {
  return [{ title: "Mealtime: kitchen" }];
}

export default function HostKitchen() {
  const { key = "", step } = useParams();
  const navigate = useNavigate();
  const { kitchen, clockOffset, error, loading } = useKitchen(key);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <Centered>Setting the table…</Centered>;
  if (error || !kitchen) return <Centered>This kitchen link doesn't work. <a className="underline" href="/">Open a new demo kitchen</a></Centered>;
  if (kitchen.role !== "host") {
    navigate(`/c/${key}`, { replace: true });
    return null;
  }
  const selected = kitchen.plan.steps.find((s) => s.id === step);
  const select = (id: string) => navigate(`/k/${key}/${id}`, { replace: true });

  return (
    <AgentSidebar
      position="right"
      storageKey={`kitchen-${key.slice(0, 8)}`}
      browserTabId={TAB_ID}
      defaultOpen
      emptyStateText="Tell me what's happening in the kitchen. Try: “the potatoes need 10 more minutes”."
      suggestions={[
        "The turkey needs 15 more minutes",
        "Hand the stuffing to Sam",
        "What should I be doing right now?",
      ]}
    >
      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
        <Header kitchen={kitchen} hostKey={key} />
        <Approvals kitchen={kitchen} hostKey={key} />
        <Timeline
          steps={kitchen.plan.steps}
          cooks={kitchen.kitchenSetup.cooks}
          serveAt={kitchen.plan.serveAt}
          projectedServeAt={kitchen.plan.projectedServeAt}
          now={now + clockOffset}
          selectedId={selected?.id}
          onSelect={select}
        />
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-4">
            {selected ? <StepPanel step={selected} hostKey={key} units={kitchen.units} cooks={kitchen.kitchenSetup.cooks} /> : <Hint />}
            <Dishes kitchen={kitchen} hostKey={key} />
            <Activity kitchen={kitchen} />
          </div>
          {kitchen.cookKey ? <CookPreview cookKey={kitchen.cookKey} /> : null}
        </div>
      </main>
    </AgentSidebar>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">{children}</main>;
}

function Header({ kitchen, hostKey }: { kitchen: KitchenView; hostKey: string }) {
  const p = kitchen.plan;
  const toConfirm = p.steps.filter((s) => s.timeSource === "estimate" && !s.confirmed).length;
  const late = p.slipMinutes > 0;
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{kitchen.title}</h1>
        <p className="text-sm text-muted-foreground">
          Dinner at <strong className="text-foreground">{fmtTime(p.serveAt)}</strong>
          {" · "}start cooking at {fmtTime(p.firstStart)}
          {" · "}
          {kitchen.dishes.length} dishes, {kitchen.kitchenSetup.cooks.length} cooks, {kitchen.kitchenSetup.ovens} oven
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {late ? (
          <span className="rounded bg-red-100 px-2 py-1 text-red-800">Running {p.slipMinutes} min late: dinner at {fmtTime(p.projectedServeAt)}</span>
        ) : (
          <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">On time</span>
        )}
        {toConfirm ? <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">{toConfirm} estimated times to check</span> : null}
        <button type="button" className="rounded border px-2 py-1" onClick={() => act("demo-clock", { kitchen: hostKey, mode: "start-now" })}>
          Start cooking now
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => act("demo-clock", { kitchen: hostKey, mode: "skip", minutes: 15 })}>
          Skip ahead 15 min
        </button>
        {kitchen.clockOffsetMin ? (
          <button type="button" className="rounded bg-sky-100 px-2 py-1 text-sky-900" onClick={() => act("demo-clock", { kitchen: hostKey, mode: "reset" })}>
            Demo clock +{kitchen.clockOffsetMin} min (reset)
          </button>
        ) : null}
        {p.conflicts.length ? <span className="rounded bg-red-100 px-2 py-1 text-red-800">{p.conflicts.length} clashes</span> : null}
        <a className="rounded border px-2 py-1" href={`/k/${hostKey}`} onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(location.href); }}>
          Copy host link
        </a>
      </div>
    </header>
  );
}

function Approvals({ kitchen, hostKey }: { kitchen: KitchenView; hostKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!kitchen.approvals.length) return null;
  return (
    <section className="flex flex-col gap-2">
      {kitchen.approvals.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          <span>
            <strong>{a.requestedBy} asks:</strong> {a.change.kind === "serve-time" ? `Move dinner to ${fmtTime(a.change.serveAt)}?` : a.summary}
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={busy === a.id} className="rounded bg-amber-900 px-3 py-1 text-white" onClick={async () => { setBusy(a.id); await act("resolve-approval", { kitchen: hostKey, approvalId: a.id, approve: true }).finally(() => setBusy(null)); }}>
              Approve
            </button>
            <button type="button" disabled={busy === a.id} className="rounded border border-amber-900 px-3 py-1" onClick={async () => { setBusy(a.id); await act("resolve-approval", { kitchen: hostKey, approvalId: a.id, approve: false }).finally(() => setBusy(null)); }}>
              Decline
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function Hint() {
  return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Click a step on the timeline to see where its time came from, mark it done, or say it's running late.</p>;
}

function StepPanel({ step, hostKey, units, cooks }: { step: PlanStep; hostKey: string; units: string; cooks: string[] }) {
  const [minutes, setMinutes] = useState(step.minutes);
  useEffect(() => setMinutes(step.minutes), [step.id, step.minutes]);
  const run = (name: string, p: Record<string, unknown>) => act(name, { kitchen: hostKey, by: "Host", via: "timeline", ...p });
  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{step.dishName}</p>
          <h2 className="text-lg font-semibold">{step.label}</h2>
          <p className="text-sm text-muted-foreground">
            {fmtTime(step.start)}–{fmtTime(step.end)} · {fmtDur(step.minutes)}
            {step.need === "oven" ? ` · oven ${step.temp ?? "?"}°${units}` : step.need === "burner" ? " · burner" : ""}
            {step.handsOn ? ` · ${step.assignedCook ?? "a cook"}` : " · waiting"}
          </p>
        </div>
        <span className="text-xs">{step.state === "done" ? "Done" : step.state === "running" ? "Cooking now" : step.state === "next" ? "Up next" : "Later"}</span>
      </div>
      <div className="mt-3 rounded bg-muted/60 p-3 text-sm">
        {step.timeSource === "quoted" ? (
          <p>
            <span className="font-medium">From the recipe:</span> “{step.quote}” <span className="text-emerald-700">✓ checked against the recipe text</span>
          </p>
        ) : step.timeSource === "host" ? (
          <p>You set this time.</p>
        ) : (
          <p className="text-amber-900">
            The recipe doesn't say how long this takes, so {fmtDur(step.minutes)} is an estimate.{" "}
            {step.confirmed ? "You confirmed it." : "Check it before you start."}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {step.state !== "done" ? (
          <>
            <button type="button" className="rounded bg-foreground px-3 py-1.5 text-background" onClick={() => run("mark-step", { stepId: step.id, status: step.state === "running" ? "done" : "start" })}>
              {step.state === "running" ? "Mark done" : "Start now"}
            </button>
            <button type="button" className="rounded border px-3 py-1.5" onClick={() => run("report-delay", { stepId: step.id, extraMinutes: 10 })}>
              Running 10 min late
            </button>
          </>
        ) : (
          <button type="button" className="rounded border px-3 py-1.5" onClick={() => run("mark-step", { stepId: step.id, status: "undo" })}>Undo done</button>
        )}
        <label className="flex items-center gap-1">
          <input type="number" min={1} className="w-16 rounded border px-2 py-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /> min
        </label>
        {minutes !== step.minutes ? (
          <button type="button" className="rounded border px-3 py-1.5" onClick={() => run("update-step", { stepId: step.id, minutes })}>Save time</button>
        ) : step.timeSource === "estimate" && !step.confirmed ? (
          <button type="button" className="rounded border border-amber-600 px-3 py-1.5" onClick={() => run("update-step", { stepId: step.id, confirm: true })}>Looks right</button>
        ) : null}
        <button type="button" className="rounded border px-3 py-1.5" onClick={() => run("update-step", { stepId: step.id, pinnedStart: step.pinnedStart ? null : step.start })}>
          {step.pinnedStart ? "Unpin" : "Pin this time"}
        </button>
        {step.handsOn && cooks.length > 1 ? (
          <button
            type="button"
            className="rounded border px-3 py-1.5"
            onClick={() => sendToAgentChat({ message: `Hand "${step.label}" (${step.dishName}) to ${cooks.find((c) => c !== step.assignedCook)}.`, submit: true })}
          >
            Hand to {cooks.find((c) => c !== step.assignedCook)}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Dishes({ kitchen, hostKey }: { kitchen: KitchenView; hostKey: string }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const check = new Map(kitchen.plan.timeCheck.map((c) => [c.dishId, c]));
  const add = async () => {
    const v = input.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      const isUrl = /^https?:\/\//.test(v);
      const r = (await act("add-dish", { kitchen: hostKey, by: "Host", via: "timeline", ...(isUrl ? { url: v } : { text: v }) })) as unknown as { dishId: string; name: string };
      setInput("");
      sendToAgentChat({ message: `Split "${r.name}" (dish ${r.dishId}) into steps, quoting the recipe for every time.`, submit: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold">Dishes</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {kitchen.dishes.map((d) => {
          const c = check.get(d.id);
          return (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1 last:border-b-0">
              <span>
                {d.name}{" "}
                {d.sourceUrl ? <a className="text-xs text-muted-foreground underline" href={d.sourceUrl} target="_blank" rel="noreferrer">{d.site}</a> : <span className="text-xs text-muted-foreground">pasted</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {d.status === "needs-steps"
                  ? "Waiting for the agent to split it into steps…"
                  : c?.stated
                    ? c.ok
                      ? `Steps add up to ${fmtDur(c.planned)}; recipe says ${fmtDur(c.stated)} ✓`
                      : `Steps add up to ${fmtDur(c.planned)} but the recipe says ${fmtDur(c.stated)}: check it`
                    : `Steps add up to ${fmtDur(c?.planned ?? 0)}; recipe gives no total`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <textarea
          className="min-h-[38px] flex-1 rounded border px-2 py-1.5 text-sm"
          rows={1}
          placeholder="Paste a recipe link, or the recipe text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" disabled={busy} className="rounded bg-foreground px-3 py-1.5 text-sm text-background" onClick={add}>
          {busy ? "Reading…" : "Add dish"}
        </button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}

function Activity({ kitchen }: { kitchen: KitchenView }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold">Activity</h2>
      <ul className="flex max-h-56 flex-col gap-1 overflow-auto text-xs">
        {kitchen.log.map((l, i) => (
          <li key={`${l.at}-${i}`} className="flex gap-2">
            <span className="w-16 shrink-0 text-muted-foreground">{fmtTime(l.at)}</span>
            <span className="w-24 shrink-0 font-medium">
              {l.by}
              <span className="font-normal text-muted-foreground"> · {l.via}</span>
            </span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CookPreview({ cookKey }: { cookKey: string }) {
  const url = useMemo(() => (typeof location === "undefined" ? `/c/${cookKey}` : `${location.origin}/c/${cookKey}`), [cookKey]);
  const [qr, setQr] = useState("");
  useEffect(() => {
    import("qrcode")
      .then((m) => ((m as unknown as { default?: typeof m }).default ?? m).toDataURL(url, { margin: 1, width: 160 }))
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);
  return (
    <aside className="flex flex-col gap-3">
      <div className="rounded-lg border p-3 text-center">
        <p className="mb-2 text-sm font-semibold">Cooks: scan to join</p>
        {qr ? <img src={qr} alt="QR code for the cook link" className="mx-auto h-40 w-40" /> : null}
        <button type="button" className="mt-2 text-xs underline" onClick={() => navigator.clipboard?.writeText(url)}>
          Copy cook link
        </button>
      </div>
      <div className="rounded-[2rem] border-8 border-foreground/80 bg-background shadow-lg">
        <p className="bg-foreground/80 pb-1 text-center text-[10px] text-background">Sam's phone (live)</p>
        <iframe title="Sam's phone" src={`/c/${cookKey}?as=Sam`} className="h-[480px] w-full rounded-b-[1.4rem]" />
      </div>
    </aside>
  );
}
