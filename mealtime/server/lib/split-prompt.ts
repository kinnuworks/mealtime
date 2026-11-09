// The rules the agent follows when it turns a recipe into timed steps.
// Shared by the in-app agent's system prompt and scripts/split-recipes.ts.
export const SPLIT_RULES = `Turn the recipe into 3 to 8 kitchen steps for a timeline.
- Give every step's minutes from the recipe, and copy the exact words that state that time into "quote", word for word as they appear in the instructions (e.g. "bake for 25 to 30 minutes"). Use a single short phrase from one instruction.
- If the recipe gives no time for a step, omit quote: it becomes an estimate the host confirms. Estimate sensibly.
- Mark waiting steps (roasting, baking, resting, chilling, simmering unattended) handsOn false; prep, stirring, mashing and assembling handsOn true.
- need: "oven" for oven steps (with temp in °F as the recipe states), "burner" for stovetop steps, "none" otherwise.
- Skip steps done days ahead (brining overnight, making stock the day before) and serving notes, tips and variations.`;
