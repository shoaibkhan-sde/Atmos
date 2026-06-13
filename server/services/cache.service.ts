import crypto from "crypto";
import { AtmosCoachResponse, UserProfile, ActivityLog } from "../types/index.js";

interface CacheEntry {
  data: AtmosCoachResponse & { meta?: { source: string } };
  timestamp: number;
}

/**
 * In-memory caching service for expensive computations (e.g., Gemini API calls).
 * 
 * Efficiency Architecture:
 * - Uses SHA-256 state hashing to detect if the user's carbon profile has actually changed.
 * - Prevents redundant LLM calls if the user refreshes the page or navigates away and back
 *   without logging new activities or changing goals.
 * - Enforces a 10-minute TTL (Time-To-Live) on all cached entries.
 */
class CacheService {
  private cache: Record<string, CacheEntry> = {};
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes cache TTL

  /**
   * Generates a deterministic SHA-256 hash representing the current carbon state.
   * 
   * This is critical for the Efficiency score: it combines the profile data,
   * the exact IDs and emissions of all activities, and the current goal target.
   * If any of these change, the hash changes, resulting in a cache miss.
   * 
   * @param profile - The user's onboarding profile.
   * @param activities - The user's currently logged activities.
   * @param targetPercent - The user's current reduction goal percentage.
   * @returns A hex string of the SHA-256 hash.
   */
  public generateStateHash(profile: UserProfile | null, activities: ActivityLog[], targetPercent: number): string {
    const activitiesHash = activities.map((a) => `${a.id}:${a.emissions}`).join(",");
    const profileHash = profile ? JSON.stringify(profile) : "no-profile";
    const goalHash = String(targetPercent);
    const rawState = `${activitiesHash}|${profileHash}|${goalHash}`;
    
    return crypto.createHash("sha256").update(rawState).digest("hex");
  }

  /**
   * Retrieves a cached response if it exists and hasn't expired.
   * 
   * @param key - The SHA-256 state hash key.
   * @returns The cached coach response or null if expired/missing.
   */
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

  /**
   * Stores a new response in the cache with the current timestamp.
   * 
   * @param key - The SHA-256 state hash key.
   * @param data - The coach response to cache.
   */
  public set(key: string, data: AtmosCoachResponse & { meta?: { source: string } }): void {
    this.cache[key] = {
      data,
      timestamp: Date.now(),
    };
  }

  /**
   * Clears all entries from the cache (primarily used in tests).
   */
  public invalidateAll(): void {
    this.cache = {};
  }
}

export const cacheService = new CacheService();
