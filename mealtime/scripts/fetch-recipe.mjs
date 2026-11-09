#!/usr/bin/env node
// Fetch a public recipe page and print its schema.org Recipe (JSON-LD) as a
// normalized JSON snapshot. No dependencies.
//
//   node scripts/fetch-recipe.mjs <url> [--out file.json]
//
// Exits non-zero if the page is not HTTP 200 or has no Recipe with
// recipeInstructions.

import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–",
  mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  frac12: "½", frac14: "¼", frac34: "¾", deg: "°", times: "×", eacute: "é",
  egrave: "è", ntilde: "ñ", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
  frac13: "⅓", frac23: "⅔", frac18: "⅛", reg: "®", trade: "™", copy: "©",
};

export function decodeEntities(s) {
  // Loop to handle double-encoded entities such as "&amp;#39;".
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    });
    if (next === s) break;
    s = next;
  }
  return s;
}

export function clean(s) {
  if (s == null) return "";
  s = String(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div)>/gi, " ")
    .replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  s = s.replace(/<[^>]*>/g, ""); // tags that were entity-encoded
  return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function isType(node, t) {
  const ty = node && node["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
}

function findRecipe(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (isType(node, "Recipe")) return node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    if (node[key]) {
      const r = findRecipe(node[key]);
      if (r) return r;
    }
  }
  return null;
}

function flattenInstructions(x, out = []) {
  if (x == null) return out;
  if (typeof x === "string") {
    const t = clean(x);
    if (t) out.push(t);
    return out;
  }
  if (Array.isArray(x)) {
    for (const i of x) flattenInstructions(i, out);
    return out;
  }
  if (typeof x === "object") {
    if (isType(x, "HowToSection") || x.itemListElement) {
      flattenInstructions(x.itemListElement, out);
      return out;
    }
    const t = clean(x.text ?? x.name ?? x.description ?? "");
    if (t) out.push(t);
  }
  return out;
}

function str(v) {
  if (v == null) return null;
  if (Array.isArray(v)) v = v[0];
  if (typeof v === "object") v = v["@value"] ?? v.name ?? null;
  return v == null ? null : clean(v) || null;
}

function yieldOf(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    // Prefer the most descriptive string ("8 servings" over "8").
    const strs = v.map((x) => clean(x)).filter(Boolean);
    return strs.sort((a, b) => b.length - a.length)[0] ?? null;
  }
  return clean(v) || null;
}

export async function fetchRecipe(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  const re = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let recipe = null;
  for (const m of html.matchAll(re)) {
    let raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "));
      } catch {
        continue;
      }
    }
    recipe = findRecipe(data);
    if (recipe) break;
  }
  if (!recipe) throw new Error(`No schema.org Recipe JSON-LD found at ${url}`);

  const instructions = flattenInstructions(recipe.recipeInstructions);
  if (!instructions.length) throw new Error(`Recipe at ${url} has no recipeInstructions`);

  const ingredients = (Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient
    : recipe.recipeIngredient
      ? [recipe.recipeIngredient]
      : recipe.ingredients ?? []
  )
    .map(clean)
    .filter(Boolean);

  return {
    url: res.url || url,
    site: new URL(res.url || url).hostname.replace(/^www\./, ""),
    fetchedAt: new Date().toISOString(),
    name: str(recipe.name),
    recipeYield: yieldOf(recipe.recipeYield),
    prepTime: str(recipe.prepTime),
    cookTime: str(recipe.cookTime),
    totalTime: str(recipe.totalTime),
    ingredients,
    instructions,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
  const url = args[0];
  if (!url) {
    console.error("usage: fetch-recipe.mjs <url> [--out file.json]");
    process.exit(2);
  }
  try {
    const json = JSON.stringify(await fetchRecipe(url), null, 2) + "\n";
    if (out) writeFileSync(out, json);
    else process.stdout.write(json);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
