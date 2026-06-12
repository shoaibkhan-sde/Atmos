import { Router } from "express";
import { dbService } from "../services/db.service.js";
import { validate, goalsSchema } from "../middleware/validate.js";
import { cacheService } from "../services/cache.service.js";

const router = Router();

router.get("/", (req, res) => {
  const goals = dbService.getGoals();
  res.json(goals);
});

router.post("/", validate(goalsSchema), (req, res) => {
  const { targetPercent, targetAnnualKg } = req.body;
  
  dbService.saveGoals(targetPercent, targetAnnualKg || 0);

  // Invalidate cache
  cacheService.invalidateAll();

  res.json({
    message: "Goals updated successfully",
    goals: dbService.getGoals(),
  });
});

export default router;
