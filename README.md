# eloquent-cavespeak

> Credit: forked from [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman). Julius built the compression concept. This project adds the rehydration layer.

Claude speaks cavespeak. Gemma rehydrates. You read prose. Token cost stays low.

---

## How it works

```
Claude Code CLI
    │  ANTHROPIC_BASE_URL=http://localhost:3000
    ↓
proxy.js (Node, local)
    ├─ injects cavespeak system prompt → Anthropic API
    ├─ tool_use responses → PASS THROUGH (no rehydration)
    └─ end_turn responses → Ollama (Gemma 4) → polished prose → CLI
```

Claude compresses internally. Gemma translates back to English. Tool calls — file reads, bash commands, searches — pass through untouched so the pipeline stays fast.

---

## Two modes

**`/skill cavespeak`** — compression only. Responses are terse caveman-speak. Cheap and fast, but raw.

**`/skill eloquent-cavespeak`** — full pipeline. Same token savings, polished output. Requires Ollama running locally.

---

## Setup

**Prerequisites:** Node.js 18+, [Ollama](https://ollama.com)

```bash
# 1. Install Ollama
brew install ollama   # or: https://ollama.com/download

# 2. Install the skills into Claude Code
npx skills add coderlevelup/eloquent-cavespeak

# 3. Clone and install dependencies
git clone https://github.com/coderlevelup/eloquent-cavespeak
cd eloquent-cavespeak
npm install
```

Then in Claude Code, run the skill — it handles starting the proxy, checking Ollama, and pulling the model automatically:

```
/skill eloquent-cavespeak
```

Follow the prompt it returns to restart Claude Code with `ANTHROPIC_BASE_URL=http://localhost:3000`.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Proxy listen port |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama base URL |
| `GEMMA_MODEL` | `gemma4:latest` | Model used for rehydration |

---

## The meta moment

Run `/skill eloquent-cavespeak` inside this repo, then ask Claude to explain how the proxy works. It will explain itself — compressed upstream, polished on the way out.
