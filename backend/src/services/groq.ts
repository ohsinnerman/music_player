import { AppError } from '../lib/errors.js';

/**
 * Minimal Groq client (OpenAI-compatible API). Only two calls: structured
 * JSON chat completions and Whisper transcription. The key lives in the
 * server env and is never logged or sent to the app.
 */
export interface GroqOptions {
  apiKey: string;
  base: string;
  model: string;
  whisperModel: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type JsonSchema = Record<string, unknown>;

export function createGroq(opts: GroqOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const root = opts.base.replace(/\/$/, '');
  const host = new URL(root).hostname;
  const timeoutMs = opts.timeoutMs ?? 25_000;

  async function post(path: string, body: string | FormData, json: boolean): Promise<Response> {
    const url = new URL(`${root}${path}`);
    if (url.hostname !== host) throw new AppError(500, 'blocked_upstream', 'Upstream host not allowed');
    try {
      return await doFetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AppError(502, 'ai_unavailable', 'The AI service didn’t answer, try again shortly');
    }
  }

  function fail(status: number): never {
    if (status === 401 || status === 403) throw new AppError(503, 'ai_unavailable', 'AI identification is not configured correctly on this server');
    if (status === 429) throw new AppError(429, 'ai_rate_limited', 'The AI service is busy, try again in a minute');
    if (status === 413) throw new AppError(413, 'payload_too_large', 'Audio clip is too large');
    throw new AppError(502, 'ai_unavailable', 'The AI service didn’t answer, try again shortly');
  }

  /** Chat completion constrained to a JSON schema; falls back to JSON mode for models without strict schemas. */
  async function chatJson<T>(system: string, user: string, name: string, schema: JsonSchema): Promise<T> {
    const base = {
      model: opts.model,
      temperature: 0.1,
      max_completion_tokens: 700,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(opts.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    };
    let res = await post('/chat/completions', JSON.stringify({ ...base, response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }), true);
    if (res.status === 400) {
      // Model doesn't support strict schemas: ask for plain JSON and describe the shape instead.
      const hinted = { ...base, messages: [{ role: 'system', content: `${system}\nReply with JSON only, matching this JSON Schema:\n${JSON.stringify(schema)}` }, base.messages[1]] };
      res = await post('/chat/completions', JSON.stringify({ ...hinted, response_format: { type: 'json_object' } }), true);
    }
    if (!res.ok) fail(res.status);
    try {
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? '';
      return JSON.parse(content) as T;
    } catch {
      throw new AppError(502, 'ai_unavailable', 'The AI service returned something unexpected');
    }
  }

  /** Speech-to-text on a short audio clip. */
  async function transcribe(audio: Uint8Array, mime: string, filename: string): Promise<{ text: string; language?: string }> {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(audio)], { type: mime }), filename);
    form.append('model', opts.whisperModel);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    const res = await post('/audio/transcriptions', form, false);
    if (!res.ok) fail(res.status);
    try {
      const body = (await res.json()) as { text?: string; language?: string };
      return { text: (body.text ?? '').trim(), language: body.language };
    } catch {
      throw new AppError(502, 'ai_unavailable', 'The AI service returned something unexpected');
    }
  }

  return { chatJson, transcribe };
}

export type Groq = ReturnType<typeof createGroq>;
