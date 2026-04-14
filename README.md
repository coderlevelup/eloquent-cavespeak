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

```bash
brew install ollama
ollama pull gemma4:latest
node proxy.js   # or: npm start
```

Then in Claude Code:

```
/skill eloquent-cavespeak
```

The skill handles checking Ollama, pulling the model if needed, starting the proxy, and setting `ANTHROPIC_BASE_URL`.

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
