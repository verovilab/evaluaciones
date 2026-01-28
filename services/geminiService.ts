
import { GoogleGenAI } from "https://esm.sh/@google/genai@1.3.0";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Revisa y corrige la ortografía/gramática de la pregunta de la docente sin cambiar el sentido.
 */
export const reviewAndFix = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Eres un corrector de estilo editorial para exámenes. Corrige únicamente errores de ortografía, puntuación y gramática de esta pregunta, manteniendo el sentido original: "${text}"`,
    });
    return response.text || text;
  } catch (error) {
    console.error("Error reviewing question:", error);
    return text;
  }
};

/**
 * Crea una versión alternativa (paráfrasis) para evitar copias.
 */
export const createAlternativeVersion = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Reescribe esta pregunta de examen usando sinónimos y una estructura diferente para que sea una versión distinta pero con el mismo nivel de dificultad y significado: "${text}"`,
    });
    return response.text || text;
  } catch (error) {
    console.error("Error paraphrasing:", error);
    return text;
  }
};
