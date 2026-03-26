/**
 * gemini-proxy — Supabase Edge Function
 * ======================================
 * Proxy seguro para llamadas a Google Gemini.
 * La API key nunca sale del servidor.
 *
 * Recibe: POST { base64Audio: string, mimeType: string }
 * Devuelve: text/plain con el diagnóstico generado
 *
 * Deploy:
 *   supabase functions deploy gemini-proxy
 *   supabase secrets set GEMINI_API_KEY=AIza...
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_PROMPT = `Eres un jefe de taller experto y profesional. Tu objetivo es explicarle al cliente el estado de su vehículo de forma clara pero técnica.

INSTRUCCIONES:
1. Empieza DIRECTAMENTE con el diagnóstico (ej: 'Hemos detectado...').
2. No incluyas saludos ni introducciones como '¡Claro que sí!' o 'Como jefe de taller...'.
3. Estructura el texto en párrafos cortos y claros.
4. Explica QUÉ avería hay, POR QUÉ ha ocurrido y qué RIESGOS conlleva no repararlo.
5. Usa un tono profesional y educativo (entre 60 y 90 palabras).

Queremos que el cliente entienda perfectamente el valor y la necesidad de la reparación.`;

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response("GEMINI_API_KEY not configured", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  let base64Audio: string;
  let mimeType: string;

  try {
    const body = await req.json();
    base64Audio = body.base64Audio;
    mimeType = body.mimeType ?? "audio/webm";
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  if (!base64Audio) {
    return new Response("Missing base64Audio", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Extraer solo la parte base64 pura (sin "data:audio/webm;base64,")
  const base64Data = base64Audio.includes(",")
    ? base64Audio.split(",")[1]
    : base64Audio;

  if (!base64Data || base64Data.length < 100) {
    return new Response("Audio demasiado corto o vacío. Graba al menos 2 segundos.", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  console.log(`[gemini-proxy] mimeType recibido: "${mimeType}" | base64Data.length: ${base64Data.length}`);

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const geminiBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ],
      },
    ],
  });

  const doFetch = () =>
    fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: geminiBody,
    });

  let geminiResponse: Response;
  try {
    geminiResponse = await doFetch();
    if (geminiResponse.status === 503) {
      console.log("[gemini-proxy] 503 recibido, reintentando en 1.5s...");
      await new Promise((r) => setTimeout(r, 1500));
      geminiResponse = await doFetch();
    }
  } catch (err) {
    return new Response(`Error conectando con Gemini: ${(err as Error).message}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    return new Response(`Error de Gemini (${geminiResponse.status}): ${errorBody}`, {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  const data = await geminiResponse.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || text.trim().length === 0) {
    return new Response(
      "Diagnóstico técnico procesado. Consulte con el taller para más detalles.",
      { headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  return new Response(text, {
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
});
