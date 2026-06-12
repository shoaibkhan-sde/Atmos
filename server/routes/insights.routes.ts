import { Router } from "express";
import { dbService } from "../services/db.service.js";
import { cacheService } from "../services/cache.service.js";
import { geminiService } from "../services/gemini.service.js";
import { aiRateLimiter } from "../middleware/rateLimiters.js";
import { noStoreCache } from "../middleware/cacheControl.js";
import { generateLocalCoachData } from "../../src/lib/localInsights.js";

const router = Router();

router.get("/", noStoreCache, aiRateLimiter, async (req, res) => {
  const profile = dbService.getProfile();
  const activities = dbService.getActivities();
  const goals = dbService.getGoals();

  if (!profile) {
    return res.json({
      insight: "Set up your onboarding profile to generate customized carbon recommendations.",
      actionPlan: [],
      goalCoaching: "Awaiting profile setup.",
      usingFallback: true,
    });
  }

  const targetPercent = goals?.targetPercent || 15;
  const stateHash = cacheService.generateStateHash(profile, activities, targetPercent);

  // Check insights cache first
  const cachedResponse = cacheService.get(stateHash);
  if (cachedResponse) {
    console.log("Serving insights from cache.");
    return res.json(cachedResponse);
  }

  let insights;
  try {
    // Generate new insights (will fallback locally if Gemini key is missing or fails)
    insights = await geminiService.generateInsights(profile, activities, targetPercent);
  } catch (error) {
    console.error("Error generating insights via Gemini service:", error);
    // Fall back to local insights
    const fallback = generateLocalCoachData(activities, profile, targetPercent);
    insights = { ...fallback, meta: { source: "local" } };
  }

  // Cache response if it compiled successfully
  cacheService.set(stateHash, insights);

  res.json(insights);
});

export default router;
