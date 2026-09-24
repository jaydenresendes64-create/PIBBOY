# MALIK // Status Terminal

A personal, Fallout-inspired life tracker: S.P.E.C.I.A.L. stats, skills, main / side / daily quests,
inventory, a Caps wallet, and a journal that turns diary entries into XP and skill proposals you
accept or reject.

Plain HTML, CSS and JavaScript: no framework, no build step.

## Project layout

```
index.html          markup
css/terminal.css    styles
js/state.js         data model, defaults, reward rules, backup validation
js/storage.js       saving: IndexedDB with a localStorage fallback, backup files
js/ai.js            journal analysis client + offline keyword rules
js/render.js        builds each tab
js/events.js        user actions
js/main.js          startup
api/analyze.js      serverless function that calls the AI model (the only place the API key lives)
```

## Run it locally

- **Without AI:** double-click `index.html`. Everything works; the journal uses the offline keyword
  rules because there's no server to hold an API key.
- **With AI:** install Node.js 18+, run `npm i -g vercel`, copy `.env.example` to `.env.local` and fill
  in `OPENAI_API_KEY`, then run `vercel dev` in this folder and open http://localhost:3000.

## Deploy

### Vercel (recommended: AI works)

1. On vercel.com, sign in with GitHub → **Add New → Project** → import this repository.
2. Framework preset **Other**, no build command, output directory = the repository root.
3. **Settings → Environment Variables:** add `OPENAI_API_KEY` (and optionally `AI_MODEL`, `AI_BASE_URL`).
4. Deploy. Every push to `main` redeploys.

The footer shows `AI analysis: on` when the key is picked up.

### GitHub Pages (static only: offline rules)

**Settings → Pages → Deploy from a branch → `main` / root.** The site is served at
`https://<user>.github.io/<repo>/`. GitHub Pages can't run `api/analyze.js` or keep a secret, so the
journal uses the offline rules there.

## The API key

| Variable         | Required | Default                      | Notes                                         |
|------------------|----------|------------------------------|-----------------------------------------------|
| `OPENAI_API_KEY` | yes      | none                         | OpenAI key, or an Azure OpenAI key            |
| `AI_MODEL`       | no       | `gpt-4o-mini`                | model name, or your Azure deployment name     |
| `AI_BASE_URL`    | no       | `https://api.openai.com/v1`  | any OpenAI-compatible `/v1` base URL          |

**OpenAI:** at platform.openai.com, create a project just for this app, give it a monthly budget
limit, and create the key inside it. For a restricted key, enable **Model capabilities** (that covers
`/v1/chat/completions`) and leave everything else at None; if calls fail with a missing
`model.request` scope, use a key with **All** permissions in that dedicated project instead. The
project must be allowed to use the model in `AI_MODEL`. One entry costs roughly 300 input and
50 output tokens.

**Azure OpenAI** (for example with Student Pack credit): deploy `gpt-4o-mini`, then set
`OPENAI_API_KEY` to the Azure key, `AI_BASE_URL` to `https://<resource>.openai.azure.com/openai/v1`
and `AI_MODEL` to the deployment name.

The function only accepts a diary entry and returns a reward proposal (it builds the prompt itself and
caps input and output), so it can't be used as a general proxy to the model. The budget limit is still
your real cost guard.

## Your data

- Saved in the browser you use (IndexedDB, falling back to localStorage). Another browser or device
  starts empty. Use **Export backup / Import backup** in the footer to move it.
- **Coming from the Claude version:** open it in Claude, click **Export backup**, then **Import backup**
  in this app.
- When AI is on, the diary text is sent to the AI provider for analysis.
- This repository is public: never commit a backup file or a key. `.gitignore` excludes both.
