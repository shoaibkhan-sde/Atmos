import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { calculateEmissions, ActivityLog, UserProfile } from "../src/lib/emissionFactors.js";
import { generateLocalCoachData, generateLocalChatResponse, AtmosCoachResponse, ActionPlanItem } from "../src/lib/localInsights.js";

// Setup dotenv
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Database structure interface
interface DBState {
  profile: UserProfile | null;
  activities: ActivityLog[];
  goals: {
    targetPercent: number;
    targetAnnualKg: number;
  };
  achievements: string[];
}

// Security middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "http://localhost:3000", "ws://localhost:3000"]
    }
  }
}));

// CORS setup
const allowedOrigins = ["http://localhost:3000", `http://localhost:${PORT}`];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy violation: Unauthorized origin"));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: "50kb" })); // Sanitization: size-limit body payload

// Rate Limiter for AI endpoints (prevent abuse/cost runaways)
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to Atmos Coach. Please try again in 15 minutes." }
});

// JSON DB setup
const DB_DIR = path.resolve(__dirname, "./data");
const DB_FILE = path.join(DB_DIR, "db.json");

function initDB(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const defaultData: DBState = {
      profile: null,
      activities: [],
      goals: {
        targetPercent: 15,
        targetAnnualKg: 0
      },
      achievements: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
  }
}
initDB();

function readDB(): DBState {
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data) as DBState;
  } catch (error) {
    console.error("Error reading database:", error);
    return { profile: null, activities: [], goals: { targetPercent: 15, targetAnnualKg: 0 }, achievements: [] };
  }
}

function writeDB(data: DBState): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing to database:", error);
  }
}

// In-Memory AI Cache
const cacheDurationMs = 10 * 60 * 1000; // 10 minutes cache TTL
const aiCache: Record<string, { data: AtmosCoachResponse; timestamp: number }> = {};

function generateStateHash(db: DBState): string {
  const activitiesHash = db.activities.map((a) => `${a.id}:${a.emissions}`).join(",");
  const profileHash = db.profile ? JSON.stringify(db.profile) : "no-profile";
  const goalHash = db.goals ? JSON.stringify(db.goals) : "no-goal";
  return `${activitiesHash}|${profileHash}|${goalHash}`;
}

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;

if (geminiApiKey && geminiApiKey !== "your_gemini_api_key_here") {
  genAI = new GoogleGenerativeAI(geminiApiKey);
  console.log("Atmos Coach: Gemini API Initialized successfully.");
} else {
  console.warn("Atmos Coach: GEMINI_API_KEY is not configured. Falling back to local rule-based insights engine.");
}

// Helper to sanitize inputs
function sanitizeString(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// Helper to check fields
function validateActivityPayload(body: unknown): boolean {
  const payload = body as Record<string, unknown> | null;
  return (
    payload !== null &&
    typeof payload.category === "string" &&
    ["Transport", "Energy", "Food", "Shopping", "Waste"].includes(payload.category) &&
    typeof payload.type === "string" &&
    typeof payload.value === "number" &&
    payload.value >= 0
  );
}

// API Routes

// Profile endpoints
app.get("/api/profile", (req, res) => {
  const db = readDB();
  res.json(db.profile);
});

app.post("/api/profile", (req, res) => {
  const db = readDB();
  const profile = req.body as UserProfile | null;

  if (!profile || typeof profile.country !== "string" || typeof profile.householdSize !== "number") {
    return res.status(400).json({ error: "Invalid profile data structure." });
  }

  // Sanitize strings
  profile.country = sanitizeString(profile.country);
  profile.primaryTransport = sanitizeString(profile.primaryTransport || "car_petrol");
  profile.dietType = sanitizeString(profile.dietType || "average");
  profile.heatingType = sanitizeString(profile.heatingType || "none");

  db.profile = profile;
  writeDB(db);
  res.json({ message: "Profile saved successfully", profile });
});

// Goals endpoints
app.get("/api/goals", (req, res) => {
  const db = readDB();
  res.json(db.goals);
});

app.post("/api/goals", (req, res) => {
  const db = readDB();
  const { targetPercent, targetAnnualKg } = req.body as { targetPercent: number; targetAnnualKg?: number };

  if (typeof targetPercent !== "number" || targetPercent < 0 || targetPercent > 100) {
    return res.status(400).json({ error: "Target percentage must be a number between 0 and 100." });
  }

  db.goals = {
    targetPercent,
    targetAnnualKg: typeof targetAnnualKg === "number" ? targetAnnualKg : 0
  };
  writeDB(db);
  res.json({ message: "Goals updated successfully", goals: db.goals });
});

// Activities endpoints
app.get("/api/activities", (req, res) => {
  const db = readDB();
  res.json(db.activities);
});

app.post("/api/activities", (req, res) => {
  if (!validateActivityPayload(req.body)) {
    return res.status(400).json({ error: "Invalid activity payload. Type must match category and value must be positive." });
  }

  const db = readDB();
  const { category, type, value, note, date } = req.body as Omit<ActivityLog, "id" | "emissions">;
  const countryCode = db.profile?.country || "US";

  // Calculate emissions
  const emissions = calculateEmissions(category, type, value, countryCode);

  const newActivity: ActivityLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    date: date ? sanitizeString(date) : new Date().toISOString().split("T")[0],
    category,
    type: sanitizeString(type),
    value,
    emissions,
    note: note ? sanitizeString(note) : ""
  };

  db.activities.push(newActivity);
  
  // Sort activities by date descending
  db.activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  writeDB(db);
  res.status(201).json({ message: "Activity added successfully", activity: newActivity });
});

app.delete("/api/activities/:id", (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const index = db.activities.findIndex((a) => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Activity transaction not found." });
  }

  db.activities.splice(index, 1);
  writeDB(db);
  res.json({ message: "Activity transaction deleted successfully." });
});

app.put("/api/activities/:id", (req, res) => {
  if (!validateActivityPayload(req.body)) {
    return res.status(400).json({ error: "Invalid activity payload." });
  }

  const db = readDB();
  const id = req.params.id;
  const index = db.activities.findIndex((a) => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Activity transaction not found." });
  }

  const { category, type, value, note, date } = req.body as Omit<ActivityLog, "id" | "emissions">;
  const countryCode = db.profile?.country || "US";
  const emissions = calculateEmissions(category, type, value, countryCode);

  db.activities[index] = {
    ...db.activities[index],
    date: date ? sanitizeString(date) : db.activities[index].date,
    category,
    type: sanitizeString(type),
    value,
    emissions,
    note: note ? sanitizeString(note) : ""
  };

  writeDB(db);
  res.json({ message: "Activity updated successfully", activity: db.activities[index] });
});

// Atmos Coach AI endpoint
app.get("/api/insights", aiRateLimiter, async (req, res) => {
  const db = readDB();
  
  if (!db.profile) {
    return res.json({
      insight: "Set up your onboarding profile to generate customized carbon recommendations.",
      actionPlan: [],
      goalCoaching: "Awaiting profile setup.",
      usingFallback: true
    });
  }

  const stateHash = generateStateHash(db);
  const now = Date.now();

  // Check cache first
  if (aiCache[stateHash] && now - aiCache[stateHash].timestamp < cacheDurationMs) {
    console.log("Serving insights from cache.");
    return res.json(aiCache[stateHash].data);
  }

  // Check if Gemini is enabled
  if (!genAI) {
    const fallback = generateLocalCoachData(db.activities, db.profile, db.goals?.targetPercent);
    return res.json(fallback);
  }

  try {
    // Call Gemini API
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const contextStr = `
User Profile:
- Location: ${db.profile.country}
- Household Size: ${db.profile.householdSize}
- Primary Transport: ${db.profile.primaryTransport} (logs average ${db.profile.weeklyTransportKm} km/week)
- Diet: ${db.profile.dietType}
- Heating Fuel: ${db.profile.heatingType}

Recent Activity Ledger (past 30 days):
${JSON.stringify(db.activities.slice(0, 30))}

Goals: Target is a ${db.goals?.targetPercent || 15}% reduction in emissions.
    `;

    // Prompt 1: Insight and Goal Coaching
    const promptText = `
You are Atmos Coach, an expert carbon accountant. Based on the user carbon ledger details:
${contextStr}

Produce a response in JSON format. The JSON must contain exactly three keys:
1. "insight": A 2-4 sentence summary of their single biggest carbon driver and why it matters in plain, encouraging language. Draw real-world equivalencies (e.g. driving distance or tree absorption).
2. "goalCoaching": A 2-sentence feedback evaluate their progress towards their ${db.goals?.targetPercent || 15}% reduction goal based on actual daily log averages.
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
    
    // Clean markdown block wrappers if model outputs them
    const cleanJsonText = text.replace(/^```json/, "").replace(/```$/, "").trim();
    
    try {
      const parsedData = JSON.parse(cleanJsonText) as {
        insight: string;
        actionPlan: ActionPlanItem[];
        goalCoaching: string;
      };
      
      const formattedResponse: AtmosCoachResponse = {
        insight: parsedData.insight || "Keep logging to build insights.",
        actionPlan: parsedData.actionPlan || [],
        goalCoaching: parsedData.goalCoaching || "Keep tracking to compare goals.",
        usingFallback: false
      };

      // Save to cache
      aiCache[stateHash] = { data: formattedResponse, timestamp: now };
      return res.json(formattedResponse);
    } catch {
      console.error("Gemini output was not valid JSON, falling back:", text);
      const fallback = generateLocalCoachData(db.activities, db.profile, db.goals?.targetPercent);
      return res.json(fallback);
    }

  } catch (error) {
    console.error("Gemini API call failed, falling back:", error);
    const fallback = generateLocalCoachData(db.activities, db.profile, db.goals?.targetPercent);
    return res.json(fallback);
  }
});

// Conversational Chat with Atmos Coach
app.post("/api/chat", aiRateLimiter, async (req, res) => {
  const { message } = req.body as { message: string };
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message string is required." });
  }

  const db = readDB();
  const sanitizedMessage = sanitizeString(message);

  if (!genAI) {
    const fallbackReply = generateLocalChatResponse(sanitizedMessage, db.activities);
    return res.json({ reply: fallbackReply, usingFallback: true });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const context = `
You are Atmos Coach, a conversational carbon accountant. Speak in helpful, expert, encouraging terms.
The user is asking: "${sanitizedMessage}"

User Profile Context:
- Country: ${db.profile?.country || "Unknown"}
- Diet: ${db.profile?.dietType || "average"}
- Primary Transit: ${db.profile?.primaryTransport || "car_petrol"}
- Goal: ${db.goals?.targetPercent || 15}% reduction

Activities summary:
Total logged transactions: ${db.activities.length}
Total emissions: ${db.activities.reduce((sum, a) => sum + a.emissions, 0).toFixed(1)} kg CO2e.

Formulate an answer under 120 words. Ground your numbers in the user's data context where applicable. 
Treat this output as markdown but do not use dangerously nested HTML.
    `;

    const result = await model.generateContent(context);
    const reply = result.response.text().trim();
    
    res.json({ reply, usingFallback: false });
  } catch (error) {
    console.error("Gemini chat failed, using local fallback:", error);
    const fallbackReply = generateLocalChatResponse(sanitizedMessage, db.activities);
    res.json({ reply: fallbackReply, usingFallback: true });
  }
});

// Serve static files in production
if (NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist");
  console.log(`Serving static files from: ${distPath}`);
  
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn("Production build folder (dist) not found. Client static serving will not work until npm run build is completed.");
  }
} else {
  // Simple welcome root for development backend debugging
  app.get("/", (req, res) => {
    res.send("Atmos Personal Carbon Ledger API is running. Point your client proxy here.");
  });
}

// Error Handler Middleware to hide stack traces
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  console.error((err as Error).stack);
  res.status(500).json({ error: "A secure server error occurred. Internal stack details are suppressed." });
});

app.listen(PORT, () => {
  console.log(`Atmos Express Server running in ${NODE_ENV} mode on port ${PORT}`);
});
