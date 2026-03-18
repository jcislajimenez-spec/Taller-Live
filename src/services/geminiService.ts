/**
 * geminiService.ts
 * ================
 * Servicio centralizado para TODAS las llamadas a Google Gemini.
 * 
 * IMPORTANTE: Usa EXCLUSIVAMENTE @google/genai (SDK nuevo).
 * NO importar NUNCA @google/generative-ai (legacy) — ese paquete
 * exporta "GoogleGenerativeAI" que NO existe en el SDK nuevo y
 * causa el error "GoogleGenerativeAI is not defined".
 */
import { GoogleGenAI } from "@google/genai";

// Singleton — se inicializa una sola vez
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VITE_GEMINI_API_KEY no está definida en .env. " +
        "Añade la clave en tu archivo .env como VITE_GEMINI_API_KEY=AIza..."
      );
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/**
 * Transcribe un audio y genera un diagnóstico profesional de taller.
 *
 * Flujo: audio base64 → Gemini → texto profesionalizado
 *
 * @param base64Audio - Audio en base64 (acepta con o sin prefijo "data:audio/...")
 * @param mimeType    - Tipo MIME del audio (por defecto "audio/webm")
 * @returns Texto del diagnóstico profesionalizado
 */
export async function transcribeAndDiagnose(
  base64Audio: string,
  mimeType: string = "audio/webm"
): Promise<string> {
  const ai = getAI();

  // Extraer solo la parte base64 pura (sin "data:audio/webm;base64,")
  const base64Data = base64Audio.includes(",")
    ? base64Audio.split(",")[1]
    : base64Audio;

  if (!base64Data || base64Data.length < 100) {
    throw new Error("Audio demasiado corto o vacío. Graba al menos 2 segundos.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        text: `Eres un jefe de taller experto y profesional. Tu objetivo es explicarle al cliente el estado de su vehículo de forma clara pero técnica.

INSTRUCCIONES:
1. Empieza DIRECTAMENTE con el diagnóstico (ej: 'Hemos detectado...').
2. No incluyas saludos ni introducciones como '¡Claro que sí!' o 'Como jefe de taller...'.
3. Estructura el texto en párrafos cortos y claros.
4. Explica QUÉ avería hay, POR QUÉ ha ocurrido y qué RIESGOS conlleva no repararlo.
5. Usa un tono profesional y educativo (entre 60 y 90 palabras).

Queremos que el cliente entienda perfectamente el valor y la necesidad de la reparación.`,
      },
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
    ],
  });

  const text = response.text;
  if (!text || text.trim().length === 0) {
    return "Diagnóstico técnico procesado. Consulte con el taller para más detalles.";
  }
  return text;
}

/**
 * Analiza una imagen de ticket/recibo y extrae datos estructurados.
 *
 * @param base64Image - Imagen en base64 (sin prefijo "data:...")
 * @param mimeType    - Tipo MIME de la imagen (ej: "image/jpeg")
 * @returns Objeto JSON con merchant, amount, date, category
 */
export async function parseReceipt(
  base64Image: string,
  mimeType: string
): Promise<{ merchant?: string; amount?: number; date?: string; category?: string }> {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      "Analiza este ticket y devuelve JSON con merchant, amount, date y category. Responde SOLO con el JSON, sin markdown ni backticks.",
    ],
  });

  const text = response.text || "{}";
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Verifica que la API key de Gemini esté configurada y parezca válida.
 */
export function isGeminiConfigured(): boolean {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return !!(key && key.length > 10 && !key.includes("placeholder"));
}
