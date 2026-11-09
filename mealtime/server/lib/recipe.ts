// Turn a recipe web page into plain data using the page's own schema.org
// Recipe markup. No model involved.

export interface ParsedRecipe {
  name: string;
  url?: string;
  site?: string;
  ingredients: string[];
  instructions: string[];
  stated: { prep?: number; cook?: number; total?: number };
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&deg;|&#176;/g, "°")
    .replace(/&frac12;/g, "1/2")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** ISO 8601 duration (PT1H30M) to minutes. */
export function isoMinutes(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : undefined;
}

function flattenInstructions(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return v.split(/\n+/).map(decode).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(flattenInstructions);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) return flattenInstructions(o.itemListElement);
    if (typeof o.text === "string") return [decode(o.text)];
    if (typeof o.name === "string") return [decode(o.name)];
  }
  return [];
}

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  if (o["@graph"]) return findRecipe(o["@graph"]);
  return null;
}

export function parseRecipeHtml(html: string, url?: string): ParsedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse((b[1] ?? "").trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const instructions = flattenInstructions(r.recipeInstructions);
    if (!instructions.length) continue;
    return {
      name: decode(String(r.name ?? "Recipe")),
      url,
      site: url ? new URL(url).hostname.replace(/^www\./, "") : undefined,
      ingredients: (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : []).map((x) => decode(String(x))),
      instructions,
      stated: { prep: isoMinutes(r.prepTime), cook: isoMinutes(r.cookTime), total: isoMinutes(r.totalTime) },
    };
  }
  return null;
}

export async function fetchRecipe(url: string): Promise<ParsedRecipe | null> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(u.hostname)) throw new Error("That address isn't allowed");
  const res = await fetch(u, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      accept: "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`The site answered ${res.status}. Paste the recipe text instead.`);
  const html = (await res.text()).slice(0, 3_000_000);
  return parseRecipeHtml(html, url);
}

/** Pasted text: first line is the name, numbered or later lines are steps. */
export function parsePastedRecipe(text: string): ParsedRecipe {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const name = (lines.shift() ?? "Pasted recipe").slice(0, 80);
  const instructions = lines.map((l) => l.replace(/^(step\s*)?\d+[.)]\s*/i, "")).filter((l) => l.length > 3);
  return { name, ingredients: [], instructions, stated: {} };
}
