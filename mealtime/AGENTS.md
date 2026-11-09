# Mealtime: agent guide

Mealtime is a shared kitchen timeline. A host pastes recipes and a serving time; code schedules every step backwards so all dishes finish together; cooks follow their own next step on their phones. The agent turns recipes into timed steps and handles changes while people cook.

## Who does what

- Code schedules (`server/lib/scheduler.ts`). The agent never computes start times. It changes durations, steps or setup through actions, and every screen reflows.
- The agent splits recipes into steps. Each duration quotes the recipe sentence it came from; `set-dish-steps` checks the quote against the recipe text. Steps without a stated time become estimates the host confirms.
- The host approves anything that affects everyone: moving serving time or handing a step to another cook (`request-approval`).

## Context

`navigation.kitchen` in `<current-screen>` is the link key for the kitchen on screen; pass it as `kitchen` to every action. `navigation.selectedStepId` is the step the person is looking at.

## Actions

| Action | Who | What |
| --- | --- | --- |
| `get-kitchen` | anyone with a link | Plan, steps with times and sources, approvals, activity |
| `read-recipe` | anyone with a link | A dish's numbered instructions and stated times |
| `add-dish` / `remove-dish` | host | Add from a recipe link (page's recipe markup) or pasted text |
| `set-dish-steps` | host | Replace a dish's steps; quotes verified by code |
| `update-step` | host | Duration, label, temperature, pin, confirm an estimate |
| `mark-step` | host or cook | Start, finish or undo a step |
| `report-delay` | host or cook | Add minutes to a late step; queues a serving-time card if dinner slips |
| `request-approval` | anyone | One-tap card for the host (serving time, hand a step to a cook) |
| `update-kitchen` | host | Ovens, burners, oven sharing tolerance, cooks, units |

## Rules

- Keep replies to one or two short sentences. People are cooking.
- Never claim a serving-time change or a reassignment happened before the host approves it.
- Never fabricate. Read the kitchen after a change if you need to report the new times.
