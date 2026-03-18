import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
});

export async function parseReceipt(base64Image: string, mimeType: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      "Analiza este ticket y devuelve JSON con merchant, amount, date y category",
    ],
  });

  return JSON.parse(response.text);
}
