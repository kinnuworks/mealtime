# Mealtime

Mealtime plans a big meal backwards from dinner time, so every dish comes out together, and sends each cook their next step on their phone.

It's built on Agent-Native because the agent and the screens edit the same plan through the same actions. Tell the agent "the potatoes need 10 more minutes" and the timeline, both phones and the activity log update together. The host taps to approve before dinner time moves.

**Live app: https://mealtime-kitchen.vercel.app** (no sign-up; every visitor gets their own demo kitchen)

## Try it in 30 seconds

1. Open the live app. A Thanksgiving dinner for two cooks, built from four real recipes, is already planned.
2. Click any bar on the timeline. You'll see the sentence from the recipe that the step's time comes from.
3. Press **Start cooking now**, then **Done** on Sam's phone (the frame on the right, or scan the QR code with your own phone).
4. Type "the turkey needs 20 more minutes" to the agent. Dinner slips, and an approval card asks you whether to move it.

## How it works

- The scheduler in `server/lib/scheduler.ts` is plain code, not the model. It works back from dinner time and places each step as late as it can go. It won't double-book an oven (two dishes share one only when their temperatures are close), a burner, or a cook's hands. Steps that are done, running or pinned stay where they are. If a step would have to start in the past, dinner slips and the header says by how much.
- The agent splits a recipe into steps and copies the recipe's own words for each time, for example "bake for 25 to 30 minutes". `set-dish-steps` checks that sentence against the recipe text. A step whose time the recipe doesn't give is marked as an estimate (amber dashed border) until the host confirms it.
- Moving dinner time or handing a step to another cook goes through `request-approval` and shows up as a one-tap card.
- The timeline buttons, the cook phones and the agent all call the same actions in `actions/`. The activity log records who made each change and where it came from (timeline, phone or agent). The same actions are also offered over the app's MCP endpoint, which asks for sign-in.

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for the agent
pnpm dev
```

Without a database URL the app uses a local embedded Postgres. Tests: `pnpm exec vitest run server/lib`.

## Built during the hackathon

Everything here was written during the Agent-Native Hackathon on top of the framework's chat starter template. The demo recipes are saved copies of public recipe pages, credited by site on each dish.
