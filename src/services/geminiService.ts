/**
 * geminiService.ts
 * ================
 * Servicio centralizado para llamadas a Gemini.
 *
 * Las llamadas van a través de la Edge Function `gemini-proxy` en Supabase.
 * La API key de Gemini NUNCA se expone en el frontend.
 *
 * Contrato sin cambios:
 *   transcribeAndDiagnose(base64Audio, mimeType) → Promise<string>
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/gemini-proxy`;

/**
 * Transcribe un audio y genera un diagnóstico profesional de taller.
 *
 * Flujo: audio base64 → Edge Function → Gemini → texto profesionalizado
 *
 * @param base64Audio - Audio en base64 (acepta con o sin prefijo "data:audio/...")
 * @param mimeType    - Tipo MIME del audio (por defecto "audio/webm")
 * @returns Texto del diagnóstico profesionalizado
 */
export async function transcribeAndDiagnose(
  base64Audio: string,
  mimeType: string = "audio/webm"
): Promise<string> {
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      base64Audio,
      mimeType: mimeType?.startsWith("audio/") ? mimeType : "audio/webm",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Error del servidor (${response.status})`);
  }

  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return "Diagnóstico técnico procesado. Consulte con el taller para más detalles.";
  }
  return text;
}

/**
 * Verifica que el proxy de Gemini esté disponible (Supabase URL configurada).
 * Se usa en App.tsx para habilitar/deshabilitar la grabación de audio.
 */
export function isGeminiConfigured(): boolean {
  return !!(
    SUPABASE_URL &&
    SUPABASE_URL.length > 10 &&
    !SUPABASE_URL.includes("xxxxxx") &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY.length > 10
  );
}
