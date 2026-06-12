import { ActivityLog, UserProfile } from "../lib/emissionFactors";
import { AtmosCoachResponse } from "../lib/localInsights";

// Standardize error handling helper
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = "An error occurred during the network request.";
    try {
      const errorJson = await response.json();
      errorMessage = errorJson.error || errorMessage;
    } catch {
      // JSON parse failed, fallback to status code message
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}

export const api = {
  // Profile
  async getProfile(): Promise<UserProfile | null> {
    const response = await fetch("/api/profile");
    return handleResponse<UserProfile | null>(response);
  },

  async saveProfile(profile: UserProfile): Promise<{ message: string; profile: UserProfile }> {
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return handleResponse<{ message: string; profile: UserProfile }>(response);
  },

  // Goals
  async getGoals(): Promise<{ targetPercent: number; targetAnnualKg: number }> {
    const response = await fetch("/api/goals");
    return handleResponse<{ targetPercent: number; targetAnnualKg: number }>(response);
  },

  async saveGoals(goals: { targetPercent: number; targetAnnualKg?: number }): Promise<{ message: string; goals: { targetPercent: number; targetAnnualKg: number } }> {
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goals),
    });
    return handleResponse<{ message: string; goals: { targetPercent: number; targetAnnualKg: number } }>(response);
  },

  // Activities
  async getActivities(): Promise<ActivityLog[]> {
    const response = await fetch("/api/activities");
    return handleResponse<ActivityLog[]>(response);
  },

  async addActivity(activity: Omit<ActivityLog, "id" | "emissions">): Promise<{ message: string; activity: ActivityLog }> {
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activity),
    });
    return handleResponse<{ message: string; activity: ActivityLog }>(response);
  },

  async updateActivity(id: string, activity: Omit<ActivityLog, "id" | "emissions">): Promise<{ message: string; activity: ActivityLog }> {
    const response = await fetch(`/api/activities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activity),
    });
    return handleResponse<{ message: string; activity: ActivityLog }>(response);
  },

  async deleteActivity(id: string): Promise<{ message: string }> {
    const response = await fetch(`/api/activities/${id}`, {
      method: "DELETE",
    });
    return handleResponse<{ message: string }>(response);
  },

  // Atmos Coach AI Insights
  async getInsights(): Promise<AtmosCoachResponse> {
    const response = await fetch("/api/insights");
    return handleResponse<AtmosCoachResponse>(response);
  },

  // Atmos Coach AI Chat
  async sendChatMessage(message: string): Promise<{ reply: string; usingFallback: boolean }> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return handleResponse<{ reply: string; usingFallback: boolean }>(response);
  },
};
