import { GoogleGenAI, Type } from "@google/genai";
import { ScenarioFile, GameState, OmniResponse } from "../types";
import { SYSTEM_INSTRUCTION } from "./systemPrompt";

class GeminiService {
  private ai: GoogleGenAI;
  private modelName = "gemini-2.5-flash";

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API_KEY is missing from environment variables");
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey || "DUMMY_KEY_FOR_DEV" });
  }

  private cleanJson(text: string): string {
    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
        clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return clean;
  }

  async generateResponse(
    scenarios: ScenarioFile[],
    state: GameState,
    query: string,
    intent: string
  ): Promise<OmniResponse> {
    
    // Construct Context from Markdown files
    // In a production app, we would vector embed this. For this app, we stuff context window.
    let context = "### DOCUMENTATION SCÉNARIO (RÉFÉRENCE CANONIQUE):\n";
    scenarios.forEach(file => {
      context += `\n--- FICHIER: ${file.name} ---\n${file.content.substring(0, 20000)}\n`; // Truncate safe guard
    });

    // Construct State String
    const stateStr = JSON.stringify(state, null, 2);

    const prompt = `
      ${context}

      ### ÉTAT DE LA PARTIE:
      ${stateStr}

      ### REQUÊTE UTILISATEUR:
      ${query}
      
      ### INTENTION:
      ${intent}
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.4, // Keep it consistent but allow minor improv
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini");

      const parsed = JSON.parse(this.cleanJson(text));
      return parsed as OmniResponse;

    } catch (error) {
      console.error("Gemini API Error:", error);
      // Fallback error response for UI
      return {
        type: 'COMPUTER_MESSAGE',
        bullets: ["ERREUR CRITIQUE SYSTÈME IA", "Vérifier clé API", "Vérifier format JSON"],
        sources: ["SYSTEM_ERROR"]
      } as OmniResponse;
    }
  }
}

export const geminiService = new GeminiService();
