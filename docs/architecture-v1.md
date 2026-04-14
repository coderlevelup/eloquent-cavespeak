# eloquent-cavespeak — Architecture v1

## What it does

Two-layer pipeline that reduces Claude's token output while preserving readability:

1. **Cavespeak** — system prompt injected by the proxy forces Claude to compress its responses (drop articles, hedges, filler; keep technical terms exact)
2. **Rehydration** — a local Ollama model expands the compressed output back into readable prose before it reaches the user

The user sees polished output. Tokens sent upstream are cheap.

---

## How it works

```
Claude Code CLI (ANTHROPIC_BASE_URL=http://localhost:3000)
    ↓
proxy.js (Node, localhost:3000)
    ├─ injects cavespeak system prompt into every request
    ├─ forces stream:false to Anthropic, buffers full response
    ├─ tool_use blocks → PASS THROUGH (logged, not rehydrated)
    └─ end_turn text → Ollama → rehydrated prose → re-emit as SSE
    ↓
Anthropic API (real upstream, credentials pass through from Claude Code session)
```

---

## Key implementation details

### Proxy (`proxy.js`)

- Pure Node stdlib — no npm dependencies
- Listens on `:3000`, upstream URL from `ANTHROPIC_BASE_URL` env var (falls back to `api.anthropic.com`)
- Strips `accept-encoding` header to avoid gzip from upstream
- Claude Code sends to `/v1/messages?beta=true` — URL check uses `startsWith`, not exact match
- Forces `stream: false` to Anthropic so we can buffer and process the full response
- Re-synthesises SSE stream for Claude Code after rehydration (Claude Code always expects SSE)
- Thinking blocks (`type: "thinking"`) handled in SSE via `thinking_delta` + `signature_delta` events — if not handled, multi-turn conversations break with `each thinking block must contain thinking` error
- Auth: Claude Code passes its own `Bearer` token in headers; proxy forwards them verbatim — no separate API key needed

### Cavespeak injection

```js
// Appended to system prompt as a new block
{
  type: "text",
  text: CAVESPEAK_SYSTEM_PROMPT
}
```

Works whether the original system prompt is a string, array, or absent.

### Rehydration

- Ollama endpoint: `http://localhost:11434/v1/chat/completions`
- Model: configurable via `GEMMA_MODEL` env var (default: `gemma4:latest`)
- Rehydration prompt: "Expand shorthand notes into clear readable paragraphs, 2-4 sentences each, keep code exact, do not add information"
- Falls back to raw cavespeak text if Ollama call fails

---

## What we learned

### What works
- The proxy approach works cleanly — no Claude Code internals needed
- Claude Code respects `ANTHROPIC_BASE_URL` — set it at launch, all traffic routes through
- Credentials pass through automatically from Claude Code's session — no user API key setup required
- Cavespeak compression is real and visible in proxy logs
- Thinking block SSE reconstruction is required for multi-turn sessions when `alwaysThinkingEnabled: true`

### What doesn't work / watch out for
- **Context pollution**: showing both cavespeak and eloquent in the response leaks the format into conversation history — Claude starts mimicking `[cavespeak]` / `[eloquent]` headers in its own output. Debug formatting should go to the proxy log only, not the response.
- **Model size matters**: `gemma3:1b` understands the task for simple cases but hallucinating and padding on complex structured content. `gemma3:4b` and above needed for reliable rehydration.
- **Sleep interrupts pulls**: `ollama pull` processes survive sleep but stall — kill and restart to resume.
- **Port conflicts**: proxy leaves ghost processes across restarts; `lsof -ti :3000 | xargs kill` before relaunching.

### Rehydration prompt evolution
1. Original: long "technical writer / cavespeak" framing → 1b didn't understand "cavespeak", asked for input instead of rehydrating
2. Simplified: "expand shorthand notes into complete sentences" → 1b copied structured content verbatim
3. Current: added "short paragraphs, 2-4 sentences, group related points" → better structure, but 1b still hallucinates on complex content

---

## Current state

| Component | Status |
|---|---|
| `proxy.js` | Working |
| `/skill cavespeak` | Working |
| `/skill eloquent-cavespeak` | Working — starts proxy, tells user to relaunch Claude Code |
| Rehydration (gemma3:1b) | Functional, quality limited |
| Rehydration (gemma4:latest) | Pending — partial download paused at ~3GB of 9.6GB |

---

## Next steps

- Resume `gemma4:latest` pull and test rehydration quality
- Evaluate whether rehydration quality justifies gemma4 over gemma3:4b
- Film the demo: `/skill cavespeak` vs `/skill eloquent-cavespeak` on same question, proxy log showing cavespeak → eloquent
- Consider: once quality is good, the proxy log cavespeak/eloquent output is the natural B-roll for the video
