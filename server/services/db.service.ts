import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DBState, UserProfile, ActivityLog } from "../types/index.js";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.resolve(__dirname, "../data");
const DB_FILE = env.NODE_ENV === "test" ? path.join(DB_DIR, "db.test.json") : path.join(DB_DIR, "db.json");
const TEMP_DB_FILE = env.NODE_ENV === "test" ? path.join(DB_DIR, "db.test.tmp.json") : path.join(DB_DIR, "db.tmp.json");

const DEFAULT_USER_ID = "default-user";

const defaultState: DBState = {
  profile: null,
  activities: [],
  goals: {
    targetPercent: 15,
    targetAnnualKg: 0,
  },
  achievements: [],
};

/**
 * JSON-file database service with in-memory state and atomic disk persistence.
 *
 * Design:
 * - All reads are served from an in-memory `state` object (zero-latency).
 * - Writes are debounced (300ms) and persisted atomically via temp-file + rename.
 * - A Promise-based write mutex prevents concurrent writes from corrupting `db.json`.
 */
class DbService {
  private state: DBState = { ...defaultState };
  private writeTimeout: NodeJS.Timeout | null = null;
  /** Write mutex: queues concurrent disk writes to prevent corruption. */
  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    this.initDB();
    this.loadDB();
  }

  private initDB(): void {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultState, null, 2), "utf-8");
    }
  }

  private loadDB(): void {
    try {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      this.state = JSON.parse(data) as DBState;
      
      // Seed default goals if missing
      if (!this.state.goals) {
        this.state.goals = { targetPercent: 15, targetAnnualKg: 0 };
      }
      if (!this.state.activities) {
        this.state.activities = [];
      }
      if (!this.state.achievements) {
        this.state.achievements = [];
      }
    } catch (error) {
      console.error("Error reading database file, using fallback state:", error);
      this.state = { ...defaultState };
    }
  }

  private saveDBDebounced(): void {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
    }
    this.writeTimeout = setTimeout(() => {
      this.saveDBAtomic();
    }, 300);
  }

  /**
   * Atomically persists the current in-memory state to disk.
   *
   * Strategy: write to a temp file first, then rename over the actual file.
   * This prevents partial writes from corrupting the DB. Uses a Promise-based
   * mutex to serialize concurrent write attempts.
   */
  private saveDBAtomic(): void {
    this.writeLock = this.writeLock.then(() => {
      try {
        // Write to temp file
        fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(this.state, null, 2), "utf-8");
        // Atomic rename
        fs.renameSync(TEMP_DB_FILE, DB_FILE);
      } catch (error) {
        console.warn("⚠️ Atomic rename failed, falling back to direct write:", error);
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), "utf-8");
        } catch (directError) {
          console.error("❌ Direct database write also failed:", directError);
        }
      }
    });
  }

  /** Returns the current user profile with a synthetic user ID, or null if unset. */
  public getProfile(): (UserProfile & { userId: string }) | null {
    if (!this.state.profile) return null;
    return {
      ...this.state.profile,
      userId: DEFAULT_USER_ID,
    };
  }

  /** Persists a user profile to the in-memory state and schedules a disk write. */
  public saveProfile(profile: UserProfile): UserProfile {
    this.state.profile = {
      ...profile,
    };
    this.saveDBDebounced();
    return this.state.profile;
  }

  /** Returns all logged activities sorted newest-first, each augmented with a synthetic user ID. */
  public getActivities(): (ActivityLog & { userId: string })[] {
    return this.state.activities.map((act) => ({
      ...act,
      userId: DEFAULT_USER_ID,
    }));
  }

  /** Upserts an activity (insert or update by ID) and schedules a disk write. */
  public saveActivity(activity: ActivityLog): void {
    const idx = this.state.activities.findIndex((a) => a.id === activity.id);
    if (idx !== -1) {
      this.state.activities[idx] = activity;
    } else {
      this.state.activities.push(activity);
    }
    this.state.activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    this.saveDBDebounced();
  }

  /** Deletes an activity by ID. Returns true if found and removed, false otherwise. */
  public deleteActivity(id: string): boolean {
    const idx = this.state.activities.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.state.activities.splice(idx, 1);
    this.saveDBDebounced();
    return true;
  }

  /** Returns the current reduction goals with a synthetic user ID. */
  public getGoals(): { targetPercent: number; targetAnnualKg: number; userId: string } {
    return {
      ...this.state.goals,
      userId: DEFAULT_USER_ID,
    };
  }

  public saveGoals(targetPercent: number, targetAnnualKg: number): void {
    this.state.goals = {
      targetPercent,
      targetAnnualKg,
    };
    this.saveDBDebounced();
  }

  // Force synchronous write (used when shutting down or testing)
  public flush(): void {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
      this.writeTimeout = null;
    }
    this.saveDBAtomic();
  }

  public reset(profile: UserProfile | null = null, activities: ActivityLog[] = [], goals = { targetPercent: 15, targetAnnualKg: 0 }): void {
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
      this.writeTimeout = null;
    }
    this.state = {
      profile,
      activities,
      goals,
      achievements: [],
    };
    this.saveDBAtomic();
  }
}

export const dbService = new DbService();
