import { Router } from "express";
import { dbService } from "../services/db.service.js";
import { geminiService } from "../services/gemini.service.js";
import { validate, chatSchema } from "../middleware/validate.js";
import { aiRateLimiter } from "../middleware/rateLimiters.js";
import { noStoreCache } from "../middleware/cacheControl.js";

const router = Router();

router.post("/", noStoreCache, aiRateLimiter, validate(chatSchema), async (req, res) => {
  const { message } = req.body;
  const profile = dbService.getProfile();
  const activities = dbService.getActivities();

  // Call chat service (will fallback locally if Gemini key is missing or fails)
  const result = await geminiService.sendChatMessage(message, profile, activities);

  res.json(result);
});

export default router;
