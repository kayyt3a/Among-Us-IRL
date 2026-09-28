// Tiny local server: serves the UI and turns a meeting transcript into
// suggested questions using Claude.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3456;
const MODEL = process.env.MEETING_COPILOT_MODEL || "claude-opus-5";
const client = new Anthropic();

const SYSTEM = `You are a discreet meeting assistant. You read a live, imperfect
speech-to-text transcript of a meeting and suggest questions the listener could
ask out loud to show they are engaged and thinking critically.

Good questions:
- Refer to something specific that was actually said (a number, a decision, a name, a plan).
- Probe risks, trade-offs, next steps, owners, deadlines, success metrics or assumptions.
- Are short enough to say naturally in one breath, in plain conversational language.
- Don't ask about something the transcript already answered.
Prefer the most recent part of the transcript. The transcript may contain
recognition errors; interpret it charitably.`;

const SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", description: "What the meeting is currently discussing, in under 12 words." },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question, phrased to be said out loud." },
          why: { type: "string", description: "One short line on why this is a sharp question." },
          type: { type: "string", enum: ["clarify", "risk", "next-steps", "metrics", "big-picture"] },
        },
        required: ["question", "why", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["topic", "questions"],
  additionalProperties: false,
};

async function suggest({ transcript, context, count }) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Low effort keeps suggestions fast enough to be useful mid-meeting.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    // If a request is declined by a safety classifier, retry on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          (context ? `About me / the meeting: ${context}\n\n` : "") +
          `<transcript>\n${transcript}\n</transcript>\n\n` +
          `Suggest ${count} questions I could ask right now.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`No output (stop_reason: ${response.stop_reason})`);
  return JSON.parse(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/questions") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const transcript = String(body.transcript || "").trim();
      if (transcript.length < 40) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "Not enough transcript yet — keep listening." }));
      }
      // Keep the most recent ~40k chars; the recent discussion matters most.
      const result = await suggest({
        transcript: transcript.slice(-40000),
        context: String(body.context || "").slice(0, 2000),
        count: Math.min(Math.max(Number(body.count) || 3, 1), 6),
      });
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(result));
    } catch (err) {
      console.error(err);
      const status = err instanceof Anthropic.APIError ? err.status || 502 : 500;
      res.writeHead(status, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(here, "public", "index.html")).pipe(res);
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Meeting Copilot running at http://localhost:${PORT} (model: ${MODEL})`);
});
