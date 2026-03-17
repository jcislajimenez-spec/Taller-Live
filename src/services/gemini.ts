import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

export async function parseReceipt(
  base64Image: string,
  mimeType: string
): Promise<ReceiptData> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image,
        },
      },
      `Analiza este ticket de compra y devuelve SOLO un JSON con esta estructura:

{
  "merchant": "nombre del comercio",
  "amount": numero,
  "date": "YYYY-MM-DD",
  "category": "categoria"
}

La categoría debe ser una de estas:
Alimentación, Restaurantes, Transporte, Ocio, Suministros, Compras, Salud, Educación, Hogar, Mascotas, Viajes, Seguros, Tecnología, Otros.
`,
    ]);

    const text = result.response.text();

    if (!text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(text) as ReceiptData;
  } catch (error) {
    console.error("Error parsing receipt:", error);
    throw error;
  }
}
