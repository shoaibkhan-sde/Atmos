import crypto from "crypto";
import { AtmosCoachResponse, UserProfile, ActivityLog } from "../types/index.js";

interface CacheEntry {
  data: AtmosCoachResponse & { meta?: { source: string } };
  timestamp: number;
}

class CacheService {
  private cache: Record<string, CacheEntry> = {};
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes cache TTL

  public generateStateHash(profile: UserProfile | null, activities: ActivityLog[], targetPercent: number): string {
    const activitiesHash = activities.map((a) => `${a.id}:${a.emissions}`).join(",");
    const profileHash = profile ? JSON.stringify(profile) : "no-profile";
    const goalHash = String(targetPercent);
    const rawState = `${activitiesHash}|${profileHash}|${goalHash}`;
    
    return crypto.createHash("sha256").update(rawState).digest("hex");
  }

  public get(key: string): (AtmosCoachResponse & { meta?: { source: string } }) | null {
    const entry = this.cache[key];
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      delete this.cache[key];
      return null;
    }

    return entry.data;
  }

  public set(key: string, data: AtmosCoachResponse & { meta?: { source: string } }): void {
    this.cache[key] = {
      data,
      timestamp: Date.now(),
    };
  }

  public invalidateAll(): void {
    this.cache = {};
  }
}

export const cacheService = new CacheService();
