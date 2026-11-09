// Runs the recipe-splitting rules over saved recipe snapshots and checks every
// step's quote with the same code the app uses. Writes:
//   fixtures/recipe-check.json  (per recipe, per step)
//   fixtures/demo-steps.json     (steps for the demo menu, --demo)
// Usage: ANTHROPIC_API_KEY=... npx tsx scripts/split-recipes.ts [--demo] [--test]
import { readFileSync, writeFileSync } from "node:fs";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import { verifyQuote, type Dish, type KStep } from "../server/lib/kitchen.js";
import { isoMinutes } from "../server/lib/recipe.js";
import { SPLIT_RULES } from "../server/lib/split-prompt.js";

const MODEL = process.env.SPLIT_MODEL ?? "claude-sonnet-5-5";
const stepSchema = z.object({
  steps: z.array(
    z.object({
      label: z.string(),
      minutes: z.number().positive(),
      quote: z.string().optional(),
      need: z.enum(["oven", "burner", "none"]),
      temp: z.number().optional(),
      handsOn: z.boolean(),
      afterPrevious: z.boolean(),
    }),
  ),
});

const idx = JSON.parse(readFileSync("fixtures/recipes/index.json", "utf8")) as { demo: string[]; test: string[] };

function toDish(slug: string, id: string): Dish {
  const r = JSON.parse(readFileSync(`fixtures/recipes/${slug}.json`, "utf8"));
  return { id, name: r.name, sourceUrl: r.url, site: r.site, stated: { prep: isoMinutes(r.prepTime), cook: isoMinutes(r.cookTime), total: isoMinutes(r.totalTime) }, ingredients: r.ingredients, instructions: r.instructions, status: "ready" };
}

async function split(d: Dish) {
  const { object } = await generateObject({
    model: anthropic(MODEL),
    schema: stepSchema,
    system: SPLIT_RULES,
    prompt: `Recipe: ${d.name}\nStated times: ${JSON.stringify(d.stated)}\nIngredients:\n${d.ingredients.join("\n")}\nInstructions:\n${d.instructions.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
  });
  return object.steps;
}

function toSteps(d: Dish, raw: Awaited<ReturnType<typeof split>>): KStep[] {
  let prev: string | undefined;
  return raw.map((s, i) => {
    const ok = verifyQuote(d, s.quote, s.minutes);
    const id = `${d.id}s${i + 1}`;
    const k: KStep = { id, dishId: d.id, label: s.label, minutes: Math.round(s.minutes), quote: ok ? s.quote : undefined, timeSource: ok ? "quoted" : "estimate", confirmed: ok, need: s.need, temp: s.need === "oven" ? s.temp : undefined, handsOn: s.handsOn, after: s.afterPrevious && prev ? [prev] : [] };
    prev = id;
    return k;
  });
}

const args = new Set(process.argv.slice(2));
if (args.has("--demo")) {
  const all: KStep[] = [];
  for (const [i, slug] of idx.demo.entries()) {
    const d = toDish(slug, `d${i + 1}`);
    all.push(...toSteps(d, await split(d)));
    console.log(`demo ${slug}: done`);
  }
  writeFileSync("fixtures/demo-steps.json", JSON.stringify(all, null, 2));
}
if (args.has("--test")) {
  const rows = [];
  for (const slug of idx.test) {
    const d = toDish(slug, "t");
    const raw = await split(d);
    const steps = toSteps(d, raw);
    const stated = d.stated?.total ?? ((d.stated?.prep ?? 0) + (d.stated?.cook ?? 0) || undefined);
    const planned = steps.reduce((a, s) => a + s.minutes, 0);
    rows.push({
      slug, site: d.site, name: d.name, url: d.sourceUrl,
      steps: steps.length,
      quoted: steps.filter((s) => s.timeSource === "quoted").length,
      quoteGiven: raw.filter((s) => s.quote).length,
      quoteFailed: raw.filter((s, i) => s.quote && steps[i]!.timeSource !== "quoted").length,
      planned, stated: stated ?? null,
      totalWithin25pct: stated ? Math.abs(planned - stated) <= Math.max(15, stated * 0.25) : null,
      detail: steps.map((s, i) => ({ label: s.label, minutes: s.minutes, timeSource: s.timeSource, quote: raw[i]!.quote ?? null })),
    });
    console.log(`test ${slug}: ${rows[rows.length - 1]!.quoted}/${steps.length} quoted`);
  }
  writeFileSync("fixtures/recipe-check.json", JSON.stringify({ model: MODEL, ranAt: new Date().toISOString(), rows }, null, 2));
}
