import { AgentSidebar, AgentToggleButton } from "@agent-native/toolkit/app/chat";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { dishColor, Timeline } from "@/components/kitchen/Timeline";
import { act, fmtDur, fmtTime, useKitchen, type KitchenView, type PlanStep } from "@/lib/kitchen-client";
import { TAB_ID } from "@/lib/tab-id";
import { askAgent, signInForAgent, useSignedIn } from "@/lib/agent-gate";

export function meta() {
  return [{ title: "Mealtime: kitchen" }];
}

export default function HostKitchen() {
  const { key = "", step } = useParams();
  const navigate = useNavigate();
  const { kitchen, clockOffset, error, loading } = useKitchen(key);
  const signedIn = useSignedIn();
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
      enabled={signedIn}
      position="right"
      storageKey={`kitchen-${key.slice(0, 8)}`}
      browserTabId={TAB_ID}
      showModelSelector={false}
      defaultOpen={typeof window === "undefined" || window.innerWidth >= 1024}
      emptyStateText="Tell me what's happening in the kitchen. Try: “the potatoes need 10 more minutes”."
      suggestions={[
        "The turkey needs 15 more minutes",
        "Hand the stuffing to Sam",
        "What should I be doing right now?",
      ]}
    >
      <main className="mt-app mt-page">
        <Header kitchen={kitchen} hostKey={key} signedIn={signedIn} />
        <Approvals kitchen={kitchen} hostKey={key} />
        <RightNow kitchen={kitchen} hostKey={key} now={now + clockOffset} />
        <div className="mt-stage">
        <Timeline
          steps={kitchen.plan.steps}
          cooks={kitchen.kitchenSetup.cooks}
          serveAt={kitchen.plan.serveAt}
          projectedServeAt={kitchen.plan.projectedServeAt}
          now={now + clockOffset}
          selectedId={selected?.id}
          onSelect={select}
        />
        </div>
        {!signedIn ? <AgentPreview kitchen={kitchen} hostKey={key} /> : null}
        <div className="mt-grid">
          <div className="mt-col">
            {selected ? <StepPanel signedIn={signedIn} step={selected} hostKey={key} units={kitchen.units} cooks={kitchen.kitchenSetup.cooks} /> : <Hint />}
            <Dishes signedIn={signedIn} kitchen={kitchen} hostKey={key} />
            <Activity kitchen={kitchen} />
          </div>
          {kitchen.cookKey ? <CookPreview cookKey={kitchen.cookKey} /> : null}
        </div>
      </main>
    </AgentSidebar>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mt-app flex min-h-dvh items-center justify-center p-6 text-center text-sm" style={{ color: "var(--mt-ink-3)" }}>{children}</main>;
}

function Header({ kitchen, hostKey, signedIn }: { kitchen: KitchenView; hostKey: string; signedIn: boolean }) {
  const p = kitchen.plan;
  const toConfirm = p.steps.filter((s) => s.timeSource === "estimate" && !s.confirmed).length;
  const late = p.slipMinutes > 0;
  return (
    <header className="mt-header">
      <div>
        <span className="mt-eyebrow"><span className="dot" />Mealtime · {kitchen.title}</span>
        <h1 className="mt-h1">
          Dinner at <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(p.projectedServeAt)}</span>.{" "}
          <span className="mt-h1-muted">Every dish on time.</span>
        </h1>
        <p className="mt-sub">
          {p.steps.some((x) => x.startedAt || x.doneAt) ? <>Cooking now</> : <>Start cooking at <strong className="mt-mono">{fmtTime(p.firstStart)}</strong></>} · {kitchen.dishes.length} dishes · {kitchen.kitchenSetup.cooks.length} cooks · {kitchen.kitchenSetup.ovens} oven
        </p>
        <div className="mt-stats">
          <span><b className="mt-mono">{p.steps.length}</b> steps planned backwards</span>
          <span><b className="mt-mono">{p.steps.filter((x) => x.timeSource === "quoted").length}</b> times quoted from the recipe</span>
          <span><b className="mt-mono">{kitchen.dishes.length}</b> real recipes</span>
        </div>
      </div>
      <div className="mt-toolbar">
        {late ? (
          <span className="mt-pill mt-pill--late">Running {p.slipMinutes} min late</span>
        ) : (
          <span className="mt-pill mt-pill--good">On time</span>
        )}
        {toConfirm ? <span className="mt-pill mt-pill--est">{toConfirm} estimated times to check</span> : null}
        {p.conflicts.length ? <span className="mt-pill mt-pill--late">{p.conflicts.length} {p.conflicts.length === 1 ? "clash" : "clashes"}</span> : null}
        {kitchen.clockOffsetMin ? (
          <button type="button" className="mt-pill mt-pill--clock" style={{ border: 0, cursor: "pointer" }} onClick={() => act("demo-clock", { kitchen: hostKey, mode: "reset" })}>
            Demo clock +{kitchen.clockOffsetMin} min · reset
          </button>
        ) : null}
        <button type="button" className="mt-btn" onClick={() => act("demo-clock", { kitchen: hostKey, mode: "start-now" })}>
          Start cooking now
        </button>
        <button type="button" className="mt-btn" onClick={() => act("demo-clock", { kitchen: hostKey, mode: "skip", minutes: 15 })}>
          Demo: skip 15 min
        </button>
        <a className="mt-btn mt-btn--ghost" href={`/k/${hostKey}`} onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(location.href); }}>
          Copy host link
        </a>
        {signedIn ? (
          <AgentToggleButton className="mt-btn mt-btn--ink h-auto w-auto" icon={<span>Ask the agent</span>} />
        ) : (
          <button type="button" className="mt-btn mt-btn--ink" onClick={signInForAgent}>
            Try the agent free
          </button>
        )}
      </div>
    </header>
  );
}

function Approvals({ kitchen, hostKey }: { kitchen: KitchenView; hostKey: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!kitchen.approvals.length) return null;
  return (
    <section className="flex flex-col gap-3">
      {kitchen.approvals.map((a) => (
        <div key={a.id} className="mt-approval">
          <span>
            <span className="who">{a.requestedBy} asks</span>
            <span className="what">{a.change.kind === "serve-time" ? `Move dinner to ${fmtTime(a.change.serveAt)}?` : a.summary}</span>
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={busy === a.id} className="mt-btn mt-btn--ink" onClick={async () => { setBusy(a.id); await act("resolve-approval", { kitchen: hostKey, approvalId: a.id, approve: true }).finally(() => setBusy(null)); }}>
              Approve
            </button>
            <button type="button" disabled={busy === a.id} className="mt-btn" onClick={async () => { setBusy(a.id); await act("resolve-approval", { kitchen: hostKey, approvalId: a.id, approve: false }).finally(() => setBusy(null)); }}>
              Decline
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

/** What each cook and the oven should be on at this minute, with the one button that fits. */
function RightNow({ kitchen, hostKey, now }: { kitchen: KitchenView; hostKey: string; now: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const open = kitchen.plan.steps.filter((s) => s.state !== "done").sort((x, y) => x.start - y.start);
  const rows = [
    ...kitchen.kitchenSetup.cooks.map((c) => ({ who: c, step: open.find((s) => s.handsOn && s.assignedCook === c) })),
    { who: "Oven", step: open.find((s) => s.need === "oven" && !s.handsOn) },
  ].filter((r): r is { who: string; step: PlanStep } => Boolean(r.step));
  if (!rows.length) return null;
  const run = async (id: string, name: string, p: Record<string, unknown>) => {
    setBusy(id);
    try {
      await act(name, { kitchen: hostKey, by: "Host", via: "timeline", stepId: id, ...p });
    } finally {
      setBusy(null);
    }
  };
  const mins = (ms: number) => Math.max(1, Math.round(Math.abs(ms) / 60_000));
  return (
    <section className="mt-rightnow" aria-label="Right now">
      <p className="mt-eyebrow"><span className="dot" />Right now · {fmtTime(now)}</p>
      <div className="mt-rightnow__rows">
        {rows.map(({ who, step: s }) => {
          const running = s.state === "running";
          const overdue = running ? now > s.end : now > s.start;
          const when = running
            ? overdue
              ? `was due at ${fmtTime(s.end)}, ${fmtDur(mins(now - s.end))} ago`
              : `until ${fmtTime(s.end)}, ${fmtDur(mins(s.end - now))} left`
            : overdue
              ? `should have started at ${fmtTime(s.start)}, ${fmtDur(mins(now - s.start))} ago`
              : `starts at ${fmtTime(s.start)}, in ${fmtDur(mins(s.start - now))}`;
          return (
            <div key={`${who}-${s.id}`} className={`mt-rightnow__row ${overdue ? "is-late" : ""}`}>
              <span className="who">{who}</span>
              <span className="what">
                <b>{s.label}</b>
                <small>{s.dishName} · {when}</small>
              </span>
              <span className="acts">
                <button type="button" disabled={busy === s.id} className="mt-btn mt-btn--ink" onClick={() => run(s.id, "mark-step", { status: running ? "done" : "start" })}>
                  {running ? "Done" : "Start"}
                </button>
                {running ? (
                  <button type="button" disabled={busy === s.id} className="mt-btn" onClick={() => run(s.id, "report-delay", { extraMinutes: 10 })}>
                    10 more min
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Hint() {
  return <p className="mt-card mt-card--flat text-sm" style={{ color: "var(--mt-ink-3)" }}>Click a step on the timeline to see where its time came from, mark it done, or say it's running late.</p>;
}

function StepPanel({ step, hostKey, units, cooks, signedIn }: { step: PlanStep; hostKey: string; units: string; cooks: string[]; signedIn: boolean }) {
  const [minutes, setMinutes] = useState(step.minutes);
  useEffect(() => setMinutes(step.minutes), [step.id, step.minutes]);
  const run = (name: string, p: Record<string, unknown>) => act(name, { kitchen: hostKey, by: "Host", via: "timeline", ...p });
  return (
    <section className="mt-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="mt-eyebrow">{step.dishName}</p>
          <h2 className="mt-h1" style={{ fontSize: 26, marginTop: 4 }}>{step.label}</h2>
          <p className="mt-sub" style={{ fontSize: 14 }}>
            <span className="mt-mono">{fmtTime(step.start)}–{fmtTime(step.end)}</span> · {fmtDur(step.minutes)}
            {step.need === "oven" ? ` · oven ${step.temp ?? "?"}°${units}` : step.need === "burner" ? " · burner" : ""}
            {step.handsOn ? ` · ${step.assignedCook ?? "a cook"}` : " · waiting"}
          </p>
        </div>
        <span className={`mt-pill ${step.state === "running" ? "mt-pill--good" : "mt-pill--clock"}`}>{step.state === "done" ? "Done" : step.state === "running" ? "Cooking now" : step.state === "next" ? "Up next" : "Later"}</span>
      </div>
      <div className={`mt-quote ${step.timeSource === "estimate" ? "mt-quote--est" : ""}`}>
        {step.timeSource === "quoted" ? (
          <p>
            From the recipe: <q>{step.quote}</q>
            <br />
            <span className="ok">✓ Checked against the recipe text</span>
          </p>
        ) : step.timeSource === "host" ? (
          <p>You set this time.</p>
        ) : (
          <p>
            The recipe doesn't say how long this takes, so {fmtDur(step.minutes)} is an estimate.{" "}
            {step.confirmed ? "You confirmed it." : "Check it before you start."}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {step.state !== "done" ? (
          <>
            <button type="button" className="mt-btn mt-btn--ink" onClick={() => run("mark-step", { stepId: step.id, status: step.state === "running" ? "done" : "start" })}>
              {step.state === "running" ? "Mark done" : "Start now"}
            </button>
            <button type="button" className="mt-btn" onClick={() => run("report-delay", { stepId: step.id, extraMinutes: 10 })}>
              Running 10 min late
            </button>
          </>
        ) : (
          <button type="button" className="mt-btn" onClick={() => run("mark-step", { stepId: step.id, status: "undo" })}>Undo done</button>
        )}
        <label className="flex items-center gap-1">
          <input type="number" min={1} className="mt-input mt-mono" style={{ width: 72, flex: "none", minHeight: 34, padding: "6px 10px" }} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /> min
        </label>
        {minutes !== step.minutes ? (
          <button type="button" className="mt-btn" onClick={() => run("update-step", { stepId: step.id, minutes })}>Save time</button>
        ) : step.timeSource === "estimate" && !step.confirmed ? (
          <button type="button" className="mt-btn mt-btn--warn" onClick={() => run("update-step", { stepId: step.id, confirm: true })}>Looks right</button>
        ) : null}
        <button type="button" className="mt-btn" onClick={() => run("update-step", { stepId: step.id, pinnedStart: step.pinnedStart ? null : step.start })}>
          {step.pinnedStart ? "Unpin" : "Pin this time"}
        </button>
        {step.handsOn && cooks.length > 1 ? (
          <button
            type="button"
            className="mt-btn"
            onClick={() => askAgent(signedIn, `Hand "${step.label}" (${step.dishName}) to ${cooks.find((c) => c !== step.assignedCook)}.`)}
          >
            Hand to {cooks.find((c) => c !== step.assignedCook)}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Dishes({ kitchen, hostKey, signedIn }: { kitchen: KitchenView; hostKey: string; signedIn: boolean }) {
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
      askAgent(signedIn, `Split "${r.name}" (dish ${r.dishId}) into steps, quoting the recipe for every time.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-card">
      <div className="mt-card-head"><h2 className="mt-h2">Dishes</h2><span className="mt-eyebrow">From real recipes</span></div>
      <ul>
        {kitchen.dishes.map((d) => {
          const c = check.get(d.id);
          return (
            <li key={d.id} className="mt-dish" style={dishColor(kitchen.dishes.map((x) => x.id), d.id)}>
              <span className="name">
                <span className="sw" />
                {d.name}
                {d.sourceUrl ? <a href={d.sourceUrl} target="_blank" rel="noreferrer">{d.site}</a> : <span className="src">pasted</span>}
              </span>
              <span className={`chk ${d.status === "needs-steps" ? "" : c?.stated ? (c.ok ? "chk--ok" : "chk--warn") : ""}`}>
                {d.status === "needs-steps"
                  ? "Waiting for the agent to split it into steps…"
                  : c?.stated
                    ? c.ok
                      ? `Close to the recipe's ${fmtDur(c.stated)} (${fmtDur(c.active)} of cooking) ✓`
                      : `${fmtDur(c.active)} of cooking, but the recipe says ${fmtDur(c.stated)}: check the times`
                    : `Steps add up to ${fmtDur(c?.planned ?? 0)}; recipe gives no total`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex gap-2">
        <textarea
          className="mt-input"
          rows={1}
          placeholder="Paste a recipe link, or the recipe text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" disabled={busy} className="mt-btn mt-btn--ink" style={{ height: 40 }} onClick={add}>
          {busy ? "Reading…" : "Add dish"}
        </button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}

function Activity({ kitchen }: { kitchen: KitchenView }) {
  return (
    <section className="mt-card">
      <div className="mt-card-head"><h2 className="mt-h2">Activity</h2><span className="mt-eyebrow">Who changed what, and from where</span></div>
      <ul className="mt-log">
        {kitchen.log.map((l, i) => (
          <li key={`${l.at}-${i}`}>
            <span className="t">{fmtTime(l.at)}</span>
            <span style={{ fontWeight: 650 }}>
              {l.by}
              <span className={`mt-via ${l.via === "agent" || l.via === "voice" ? "mt-via--agent" : ""}`}>{l.via}</span>
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
      .then((m) => ((m as unknown as { default?: typeof m }).default ?? m).toDataURL(url, { margin: 1, width: 240, color: { dark: "#1d1d1f", light: "#ffffff" } }))
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);
  return (
    <aside className="mt-col">
      <div className="mt-card mt-qr">
        {qr ? <img src={qr} alt="QR code for the cook link" /> : null}
        <div>
          <h2 className="mt-h2">Cooks: scan to join</h2>
          <p className="text-sm" style={{ color: "var(--mt-ink-3)", margin: "4px 0 10px" }}>Each phone shows only that cook's next step.</p>
          <button type="button" className="mt-btn" onClick={() => navigator.clipboard?.writeText(url)}>
            Copy cook link
          </button>
        </div>
      </div>
      <div>
        <div className="mt-phone">
          <div className="mt-phone__screen">
            <iframe title="Sam's phone" src={`/c/${cookKey}?as=Sam`} />
          </div>
        </div>
        <p className="mt-phone__label"><span className="live" />Sam's phone, live</p>
      </div>
    </aside>
  );
}

/** Signed-out visitors can't use the site's AI key, so show a real recorded run and a fast way in. */
function AgentPreview({ kitchen, hostKey }: { kitchen: KitchenView; hostKey: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // The turkey's main cooking step: the longest oven step of the first dish.
  const turkeyId = kitchen.dishes[0]?.id;
  const main = kitchen.plan.steps
    .filter((x) => x.dishId === turkeyId && x.state !== "done" && (x.need === "oven" || x.need === "burner"))
    .sort((a, b) => b.minutes - a.minutes)[0];
  const tryIt = async () => {
    if (!main) return;
    setBusy(true);
    try {
      const r = (await act("report-delay", { kitchen: hostKey, stepId: main.id, extraMinutes: 20, by: "You", via: "timeline" })) as unknown as { dinnerSlipsBy?: number };
      setDone(r?.dinnerSlipsBy ? `Added 20 min to "${main.label}". Dinner would be ${r.dinnerSlipsBy} min late, so there's an approval card at the top.` : `Added 20 min to "${main.label}". There was enough slack, so dinner stays put.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-card mt-agentpreview">
      <img src="/agent-loop.gif" alt="A real run: the host tells the agent the turkey needs 20 more minutes; the agent adds the time to the right step, an approval card appears, and dinner moves only after Approve" />
      <div>
        <span className="mt-eyebrow"><span className="dot" />The kitchen agent · a real run from this app</span>
        <h2 className="mt-h1" style={{ fontSize: 30, marginTop: 8 }}>Say what's happening. The plan keeps up.</h2>
        <p className="mt-sub" style={{ fontSize: 15.5, lineHeight: 1.55 }}>
          Tell it "the turkey needs 20 more minutes". It finds the step, every screen reflows, and dinner only moves after you tap Approve. It can also split a pasted recipe into steps, quoting the recipe for each time.
        </p>
        <div className="mt-toolbar" style={{ marginTop: 16 }}>
          <button type="button" className="mt-btn mt-btn--ink mt-btn--lg" onClick={signInForAgent}>
            Sign up to try the agent
          </button>
          <span className="text-sm" style={{ color: "var(--mt-ink-3)" }}>Any email, no verification, about 15 seconds.</span>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--mt-line)" }}>
          <p className="text-sm" style={{ color: "var(--mt-ink-3)", marginBottom: 8 }}>
            Or try the agent's own action now, no account needed. This button calls <span className="mt-mono">report-delay</span>, the same action the agent calls when you tell it the turkey is late:
          </p>
          <button type="button" className="mt-btn" disabled={busy || !main} onClick={tryIt}>
            {busy ? "Working…" : "“The turkey needs 20 more minutes”"}
          </button>
          {done ? <p className="text-sm" style={{ marginTop: 8, color: "var(--mt-good)" }}>{done}</p> : null}
        </div>
      </div>
    </section>
  );
}
