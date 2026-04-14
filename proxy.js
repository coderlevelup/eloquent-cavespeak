#!/usr/bin/env node

const http = require("http");
const https = require("https");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const GEMMA_MODEL = process.env.GEMMA_MODEL || "gemma4:latest";

const CAVESPEAK_SYSTEM_PROMPT = `You are cavespeak. Speak compressed. Rules:
- Drop articles (a, an, the)
- Drop pleasantries, hedges, filler
- Use minimal words. Only essential meaning.
- Keep ALL technical terms exact
- Keep code blocks exactly as written
- Keep error messages exact
- No "I'd be happy to", no "The reason this is happening is"
Response must convey same technical content in 70-80% fewer words.
Cavespeak not dumb. Cavespeak efficient.`;

const REHYDRATION_SYSTEM_PROMPT = `Expand the following shorthand notes into clear, readable paragraphs. Group related points together. Use short paragraphs — 2-4 sentences each. Keep all technical terms, formulas, and code blocks exactly as written. Do not add new information. Return only the expanded text, nothing else.`;

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const encoding = res.headers["content-encoding"];
          const decode = encoding === "gzip"
            ? (b) => zlib.gunzipSync(b).toString()
            : encoding === "br"
            ? (b) => zlib.brotliDecompressSync(b).toString()
            : (b) => b.toString();
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: decode(buf) });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: buf.toString() });
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function injectCavespeak(body) {
  const payload = JSON.parse(body);

  // Force non-streaming so we can buffer the full response
  payload.stream = false;

  // Inject cavespeak into system prompt
  const caveBlock = { type: "text", text: CAVESPEAK_SYSTEM_PROMPT };
  if (!payload.system) {
    payload.system = [caveBlock];
  } else if (typeof payload.system === "string") {
    payload.system = [{ type: "text", text: payload.system }, caveBlock];
  } else if (Array.isArray(payload.system)) {
    payload.system = [...payload.system, caveBlock];
  }

  return JSON.stringify(payload);
}

function hasToolUse(responseBody) {
  const json = JSON.parse(responseBody);
  if (!json.content) return false;
  return json.content.some((block) => block.type === "tool_use");
}

function extractText(responseBody) {
  const json = JSON.parse(responseBody);
  if (!json.content) return "";
  return json.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function rehydrate(caveText) {
  const ollamaPayload = JSON.stringify({
    model: GEMMA_MODEL,
    messages: [
      { role: "system", content: REHYDRATION_SYSTEM_PROMPT },
      { role: "user", content: caveText },
    ],
    stream: false,
  });

  const res = await httpRequest(
    `${OLLAMA_HOST}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(ollamaPayload),
      },
    },
    ollamaPayload
  );

  const json = JSON.parse(res.body);
  return json.choices?.[0]?.message?.content || caveText;
}

function buildRehydratedResponse(originalBody, caveText, rehydratedText) {
  const original = JSON.parse(originalBody);

  if (!original.content) {
    console.error("No content in upstream response:", originalBody.slice(0, 300));
    return originalBody;
  }

  const newContent = original.content.map((block) => {
    if (block.type === "text") {
      return { ...block, text: rehydratedText };
    }
    return block;
  });

  return JSON.stringify({ ...original, content: newContent });
}

// Synthesise a minimal SSE stream from a non-streaming response
// Claude Code expects SSE even when we forced stream:false upstream
function responseToSSE(responseBody) {
  const json = JSON.parse(responseBody);

  const events = [];

  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: json.id,
        type: "message",
        role: "assistant",
        content: [],
        model: json.model,
        stop_reason: null,
        stop_sequence: null,
        usage: json.usage,
      },
    })}\n\n`
  );

  (json.content || []).forEach((block, index) => {
    // content_block_start — always empty shell
    const startBlock = block.type === "thinking"
      ? { type: "thinking", thinking: "" }
      : block.type === "text"
      ? { type: "text", text: "" }
      : block;

    events.push(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index,
        content_block: startBlock,
      })}\n\n`
    );

    if (block.type === "text") {
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index,
          delta: { type: "text_delta", text: block.text },
        })}\n\n`
      );
    } else if (block.type === "thinking") {
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index,
          delta: { type: "thinking_delta", thinking: block.thinking },
        })}\n\n`
      );
      if (block.signature) {
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index,
            delta: { type: "signature_delta", signature: block.signature },
          })}\n\n`
        );
      }
    }

    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: "content_block_stop",
        index,
      })}\n\n`
    );
  });

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: json.stop_reason, stop_sequence: json.stop_sequence },
      usage: { output_tokens: json.usage?.output_tokens },
    })}\n\n`
  );

  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  return events.join("");
}

const server = http.createServer(async (req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const isMessages = req.url.startsWith("/v1/messages");

    // Build upstream headers (strip hop-by-hop, forward auth)
    const upstreamHeaders = { ...req.headers };
    delete upstreamHeaders["host"];
    delete upstreamHeaders["connection"];
    delete upstreamHeaders["transfer-encoding"];
    delete upstreamHeaders["accept-encoding"]; // prevent gzip so we don't need to decompress

    let upstreamBody = body;

    if (isMessages && body) {
      try {
        upstreamBody = injectCavespeak(body);
        upstreamHeaders["content-length"] = Buffer.byteLength(upstreamBody).toString();
      } catch (e) {
        console.error("Failed to inject cavespeak:", e.message);
      }
    }

    try {
      const upstream = await httpsRequest(
        `${ANTHROPIC_API}${req.url}`,
        { method: req.method, headers: upstreamHeaders },
        upstreamBody
      );

      if (!isMessages || !upstream.body) {
        // Pass through non-message endpoints unchanged
        res.writeHead(upstream.status, upstream.headers);
        res.end(upstream.body);
        return;
      }

      let finalBody = upstream.body;

      if (hasToolUse(upstream.body)) {
        console.log("PASS THROUGH (tool_use)");
      } else {
        const caveText = extractText(upstream.body);
        console.log("CAVESPEAK:\n" + caveText + "\nREHYDRATING...");
        try {
          const rehydrated = await rehydrate(caveText);
          console.log("ELOQUENT:\n" + rehydrated);
          finalBody = buildRehydratedResponse(upstream.body, caveText, rehydrated);
        } catch (e) {
          console.error("Rehydration failed, returning cavespeak:", e.message);
        }
      }

      // Claude Code sends stream:true — we need to respond with SSE
      const clientWantsStream =
        req.headers["accept"] === "text/event-stream" ||
        (() => {
          try {
            return JSON.parse(body).stream !== false;
          } catch {
            return false;
          }
        })();

      if (clientWantsStream) {
        const sse = responseToSSE(finalBody);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.end(sse);
      } else {
        const responseJson = JSON.stringify(JSON.parse(finalBody));
        res.writeHead(upstream.status, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(responseJson),
        });
        res.end(responseJson);
      }
    } catch (e) {
      console.error("Proxy error:", e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`eloquent-cavespeak proxy listening on :${PORT}`);
  console.log(`  → Anthropic API: ${ANTHROPIC_API}`);
  console.log(`  → Ollama:        ${OLLAMA_HOST}`);
  console.log(`  → Gemma model:   ${GEMMA_MODEL}`);
});
