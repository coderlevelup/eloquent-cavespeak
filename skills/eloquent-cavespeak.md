Start the eloquent-cavespeak pipeline for this session.

This activates a two-layer system: Claude compresses output via cavespeak, then a local Gemma 4 proxy rehydrates it into polished prose before it reaches you.

Run the following steps using the Bash tool:

**Step 1 — Check Ollama is running**
```bash
curl -s http://localhost:11434 > /dev/null 2>&1 || (ollama serve > /tmp/ollama.log 2>&1 & sleep 2)
```

**Step 2 — Check gemma4:latest is available**
```bash
ollama list | grep -q "gemma4" || ollama pull gemma4:latest
```

**Step 3 — Start the proxy**
```bash
pkill -f "node.*proxy.js" 2>/dev/null
cd ~/clode/eloquent-cavespeak && GEMMA_MODEL=gemma4:latest node proxy.js > /tmp/eloquent-cavespeak-proxy.log 2>&1 &
sleep 1 && curl -s http://localhost:3000 > /dev/null && echo "proxy up" || echo "proxy failed — check /tmp/eloquent-cavespeak-proxy.log"
```

After the proxy is running, tell the user:

---

Proxy is running on `:3000`. To activate rehydration, restart Claude Code with:

```bash
ANTHROPIC_BASE_URL=http://localhost:3000 claude
```

Or add to your shell permanently (replaces existing ANTHROPIC_BASE_URL in ~/.zshrc):

```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
```

The proxy forwards your existing credentials automatically — no API key setup needed.

`✓ proxy ready — restart Claude Code to activate rehydration`
