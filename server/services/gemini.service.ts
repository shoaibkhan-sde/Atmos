import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { generateLocalCoachData, generateLocalChatResponse } from "../../src/lib/localInsights.js";
import { dbService } from "./db.service.js";
import { AtmosCoachResponse, UserProfile, ActivityLog } from "../types/index.js";

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const key = env.GEMINI_API_KEY;
    if (key && key !== "your_gemini_api_key_here") {
      this.genAI = new GoogleGenerativeAI(key);
      console.log("Atmos Coach: Gemini API Initialized successfully.");
    } else {
      console.warn("Atmos Coach: GEMINI_API_KEY is not configured. Falling back to local rule-based insights engine.");
    }
  }

  public isGeminiActive(): boolean {
    return this.genAI !== null;
  }

  public async generateInsights(
    profile: UserProfile | null,
    activities: ActivityLog[],
    targetPercent: number
  ): Promise<AtmosCoachResponse & { meta?: { source: string } }> {
    if (!this.genAI) {
      const fallback = generateLocalCoachData(activities, profile, targetPercent);
      return { ...fallback, meta: { source: "local" } };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const contextStr = `
User Profile:
- Location: ${profile?.country || "Unknown"}
- Household Size: ${profile?.householdSize || "Unknown"}
- Primary Transport: ${profile?.primaryTransport || "Unknown"} (logs average ${profile?.weeklyTransportKm || 0} km/week)
- Diet: ${profile?.dietType || "average"}
- Heating Fuel: ${profile?.heatingType || "none"}

Recent Activity Ledger (past 30 days):
${JSON.stringify(activities.slice(0, 30))}

Goals: Target is a ${targetPercent}% reduction in emissions.
      `;

      const promptText = `
You are Atmos Coach, an expert carbon accountant. Based on the user carbon ledger details:
${contextStr}

Produce a response in JSON format. The JSON must contain exactly three keys:
1. "insight": A 2-4 sentence summary of their single biggest carbon driver and why it matters in plain, encouraging language. Draw real-world equivalencies (e.g. driving distance or tree absorption).
2. "goalCoaching": A 2-sentence feedback evaluate their progress towards their ${targetPercent}% reduction goal based on actual daily log averages.
3. "actionPlan": A list of exactly 3 to 5 recommended actionable tasks. Each task must be an object with keys:
   - "id": a unique string (e.g., "action_commute")
   - "title": short task name
   - "description": 1-sentence action details
   - "co2SavedKg": estimated weekly carbon savings (number in kg)
   - "category": one of: "Transport", "Energy", "Food", "Shopping", "Waste"
   - "difficulty": one of: "Easy", "Medium", "Hard"

Output ONLY the raw valid JSON, no markdown syntax wrapper (like \`\`\`json).
      `;

      const result = await model.generateContent(promptText);
      const text = result.response.text().trim();
      
      const cleanJsonText = text.replace(/^```json/, "").replace(/```$/, "").trim();
      const parsedData = JSON.parse(cleanJsonText);

      return {
        insight: parsedData.insight || "Keep logging to build insights.",
        actionPlan: parsedData.actionPlan || [],
        goalCoaching: parsedData.goalCoaching || "Keep tracking to compare goals.",
        usingFallback: false,
      };

    } catch (error) {
      console.error("Gemini API insights call failed, falling back:", error);
      const fallback = generateLocalCoachData(activities, profile, targetPercent);
      return { ...fallback, meta: { source: "local" } };
    }
  }

  public async sendChatMessage(
    message: string,
    profile: UserProfile | null,
    activities: ActivityLog[]
  ): Promise<{ reply: string; usingFallback: boolean }> {
    if (!this.genAI) {
      const reply = generateLocalChatResponse(message, activities);
      return { reply, usingFallback: true };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const context = `
You are Atmos Coach, a conversational carbon accountant. Speak in helpful, expert, encouraging terms.
The user is asking: "${message}"

User Profile Context:
- Country: ${profile?.country || "Unknown"}
- Diet: ${profile?.dietType || "average"}
- Primary Transit: ${profile?.primaryTransport || "car_petrol"}
- Goal: ${dbService.getGoals()?.targetPercent || 15}% reduction

Activities summary:
Total logged transactions: ${activities.length}
Total emissions: ${activities.reduce((sum, a) => sum + a.emissions, 0).toFixed(1)} kg CO2e.

Formulate an answer under 120 words. Ground your numbers in the user's data context where applicable. 
Treat this output as markdown but do not use dangerously nested HTML.
      `;

      const result = await model.generateContent(context);
      return {
        reply: result.response.text().trim(),
        usingFallback: false,
      };
    } catch (error) {
      console.error("Gemini chat API call failed, using local fallback:", error);
      const reply = generateLocalChatResponse(message, activities);
      return { reply, usingFallback: true };
    }
  }
}

export const geminiService = new GeminiService();
