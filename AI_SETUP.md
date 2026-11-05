# AI mode setup (optional, about 5 minutes)

AI mode needs the account system (Neon database + `APP_SECRET`, see ACCOUNTS_SETUP.md), because the AI keys must stay on the server and never in the browser. Without accounts the app works exactly as before and AI mode simply does not appear.

## Connect an AI service
1. Log in as the admin, open the account menu (top right), choose **Settings**, then the **AI mode** tab.
2. Each service has its own box: ChatGPT (OpenAI), Google Gemini, Claude (Anthropic), Mistral, Groq, DeepSeek, Grok (xAI), OpenRouter.
3. Get a key from the service's website (the link is shown under each box), paste it in that service's box and press **Save and connect**.
4. The software sends one tiny test request. If the service accepts the key it is saved (encrypted with `APP_SECRET`) and the box shows "Connected, key ends ...1234". If not, you see the reason (wrong key, no quota, unknown model name).
5. The **Model** field has a default, but providers rename models often. If the test says the model is unknown, copy a current model name from the provider's website into the field.
6. Optional: choose the default service, how many AI designs each customer may make per day, or switch AI mode off for customers.

You can instead set `OPENAI_API_KEY`, `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in Vercel (Settings > Environment Variables, then redeploy). Keys pasted in the panel replace these.

## What customers see
The card is always visible in **Auto design**. If no AI service is connected (or the visitor is not logged in), it shows the reason and its button builds a design with the built-in rule-based generator from the same form, clearly labelled. In **Auto design**, once a service is connected, the card "AI mode (optional)" appears for logged-in customers once a service is connected. They fill: floors, bedrooms, what they need, street side, setbacks and free notes. Plot, building type, north direction and budget come from the project. Pressing **Create with AI** shows a preview, AI suggestions and the usual checks. **Use this design** puts it in the project, fully editable, and Undo restores the old design.

## How it is kept safe and honest
- The AI is told to produce only a floor-plan JSON for this software. Its answer is never run as code or shown as instructions: it is parsed, and every room is checked (inside the plot or shaped-plot rectangle, setbacks respected, no overlaps, sensible sizes, every room reachable by a door, a staircase on every floor). If a check fails, the problems are sent back to the AI for up to two automatic corrections. If it still fails, the customer is told and can try again, pick another service, or use the rule-based generator.
- Doors and windows are placed by the same rule-based code as the normal Auto design, then the normal validation runs.
- Customer notes are length-limited, cleaned, and sent to the AI only as data.
- Keys are tested before saving, stored encrypted, never sent to the browser, and never included in error messages.
- Each customer has a daily limit (default 20). The count is stored in the database.
- Every AI design is labelled as an AI suggestion. It is a concept, not an approved drawing.

## Costs and limits
Each design is billed by the AI service to the key owner (usually a few cents or less, but check your plan). Vercel's free plan stops a function at 60 seconds, so very slow models may time out; automatic correction only runs when the first answer came back quickly.
