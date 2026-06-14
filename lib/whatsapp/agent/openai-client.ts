export interface OpenAiJsonResult<T> {
  ok: boolean
  data?: T
  model?: string
  raw?: unknown
  error?: string
}

export async function openAiJsonCompletion<T>(params: {
  apiKey: string
  model: string
  system: string
  user: string
}): Promise<OpenAiJsonResult<T>> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    })

    const raw = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg =
        typeof (raw as { error?: { message?: string } }).error?.message ===
        'string'
          ? (raw as { error: { message: string } }).error.message
          : `HTTP ${res.status}`
      return { ok: false, model: params.model, raw, error: errMsg }
    }

    const content = (raw as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content
    if (!content) {
      return { ok: false, model: params.model, raw, error: 'Empty OpenAI response' }
    }

    const data = JSON.parse(content) as T
    return { ok: true, data, model: params.model, raw }
  } catch (err) {
    return {
      ok: false,
      model: params.model,
      error: err instanceof Error ? err.message : 'OpenAI request failed',
    }
  }
}
