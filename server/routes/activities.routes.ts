import { Router } from "express";
import { dbService } from "../services/db.service.js";
import { validate, activitySchema } from "../middleware/validate.js";
import { calculateEmissions } from "../../src/lib/emissionFactors.js";
import { cacheService } from "../services/cache.service.js";
import { ActivityLog } from "../types/index.js";

const router = Router();

router.get("/", (req, res) => {
  const activities = dbService.getActivities();
  res.json(activities);
});

router.post("/", validate(activitySchema), (req, res) => {
  const { category, type, value, note, date } = req.body;
  const profile = dbService.getProfile();
  const countryCode = profile?.country || "US";

  // Calculate carbon emissions in kg CO2e
  const emissions = calculateEmissions(category, type, value, countryCode);

  const newActivity: ActivityLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    date: date || new Date().toISOString().split("T")[0],
    category,
    type,
    value,
    emissions,
    note: note || "",
  };

  dbService.saveActivity(newActivity);
  
  // Invalidate insights cache
  cacheService.invalidateAll();

  res.status(201).json({
    message: "Activity added successfully",
    activity: newActivity,
  });
});

router.put("/:id", validate(activitySchema), (req, res) => {
  const id = req.params.id;
  const activities = dbService.getActivities();
  const existing = activities.find((a) => a.id === id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Activity transaction not found.",
      },
    });
  }

  const { category, type, value, note, date } = req.body;
  const profile = dbService.getProfile();
  const countryCode = profile?.country || "US";

  // Recalculate emissions
  const emissions = calculateEmissions(category, type, value, countryCode);

  const updatedActivity: ActivityLog = {
    id,
    date: date || existing.date,
    category,
    type,
    value,
    emissions,
    note: note || "",
  };

  dbService.saveActivity(updatedActivity);

  // Invalidate insights cache
  cacheService.invalidateAll();

  res.json({
    message: "Activity updated successfully",
    activity: updatedActivity,
  });
});

router.delete("/:id", (req, res) => {
  const id = req.params.id;
  const success = dbService.deleteActivity(id);

  if (!success) {
    return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Activity transaction not found.",
      },
    });
  }

  // Invalidate insights cache
  cacheService.invalidateAll();

  res.json({
    message: "Activity transaction deleted successfully.",
  });
});

export default router;
