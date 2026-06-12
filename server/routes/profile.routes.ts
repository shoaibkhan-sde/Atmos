import { Router } from "express";
import { dbService } from "../services/db.service.js";
import { validate, profileSchema } from "../middleware/validate.js";
import { cacheService } from "../services/cache.service.js";

const router = Router();

router.get("/", (req, res) => {
  const profile = dbService.getProfile();
  res.json(profile);
});

router.post("/", validate(profileSchema), (req, res) => {
  const updatedProfile = dbService.saveProfile(req.body);
  
  // Invalidate cache since profile changed
  cacheService.invalidateAll();

  res.json({
    message: "Profile saved successfully",
    profile: updatedProfile,
  });
});

export default router;
