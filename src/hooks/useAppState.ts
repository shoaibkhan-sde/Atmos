import { useState, useEffect, useMemo, useCallback } from "react";
import { UserProfile, ActivityLog, calculateOnboardingFootprint } from "../lib/emissionFactors";
import { ActionPlanItem } from "../lib/localInsights";
import { api } from "../services/api";

/** Tab identifiers for the main application navigation. */
export type AppTab = "dashboard" | "activities" | "coach" | "goals" | "actions" | "reports";

/** Return type of the useAppState hook containing all app-level state and handlers. */
export interface AppState {
  // Data states
  profile: UserProfile | null;
  activities: ActivityLog[];
  goals: { targetPercent: number; targetAnnualKg: number };
  dailyBudget: number;
  adoptedActions: ActionPlanItem[];
  streakCount: number;

  // UI states
  loading: boolean;
  offlineMode: boolean;
  activeTab: AppTab;
  mobileMenuOpen: boolean;
  showResetConfirm: boolean;
  isEditingProfile: boolean;

  // Setters
  setActiveTab: (tab: AppTab) => void;
  setMobileMenuOpen: (open: boolean) => void;
  setShowResetConfirm: (show: boolean) => void;
  setIsEditingProfile: (editing: boolean) => void;

  // Handlers
  handleOnboardingComplete: (newProfile: UserProfile, startingBudget: number, annualFootprint: number) => Promise<void>;
  handleAddActivity: (act: Omit<ActivityLog, "id" | "emissions">) => Promise<void>;
  handleUpdateActivity: (id: string, act: Omit<ActivityLog, "id" | "emissions">) => Promise<void>;
  handleDeleteActivity: (id: string) => Promise<void>;
  handleUpdateGoals: (newGoals: { targetPercent: number; targetAnnualKg: number }) => Promise<void>;
  handleAdoptAction: (action: ActionPlanItem) => void;
  handleRemoveAdopted: (id: string) => void;
  handleCompleteActionLog: (id: string, co2Saved: number) => void;
  handleResetProfile: () => void;
}

/**
 * Central app state hook that manages all top-level data, UI state,
 * and CRUD handlers for the Atmos application.
 *
 * Handles initial data loading from the Express backend with localStorage
 * fallback for offline resilience.
 */
export function useAppState(): AppState {
  // Global Data States
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [goals, setGoals] = useState<{ targetPercent: number; targetAnnualKg: number }>({ targetPercent: 15, targetAnnualKg: 0 });
  const [dailyBudget, setDailyBudget] = useState<number>(12);
  const [adoptedActions, setAdoptedActions] = useState<ActionPlanItem[]>([]);

  // App Infrastructure States
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // 1. Initial State Load (Sync API -> LocalStorage Fallback)
  useEffect(() => {
    const initApp = async (): Promise<void> => {
      try {
        const [apiProfile, apiActivities, apiGoals] = await Promise.all([
          api.getProfile(),
          api.getActivities(),
          api.getGoals(),
        ]);

        if (apiProfile) {
          setProfile(apiProfile);
          const { dailyBudgetKg } = calculateOnboardingFootprint(apiProfile);
          setDailyBudget(apiGoals?.targetAnnualKg ? Number((apiGoals.targetAnnualKg / 365).toFixed(1)) : dailyBudgetKg);
          localStorage.setItem("atmos_profile", JSON.stringify(apiProfile));
        } else {
          const localProf = localStorage.getItem("atmos_profile");
          if (localProf) {
            const parsed = JSON.parse(localProf) as UserProfile;
            setProfile(parsed);
            const { dailyBudgetKg } = calculateOnboardingFootprint(parsed);
            setDailyBudget(dailyBudgetKg);
          }
        }

        setActivities(apiActivities || []);
        localStorage.setItem("atmos_activities", JSON.stringify(apiActivities || []));

        if (apiGoals) {
          setGoals(apiGoals);
          localStorage.setItem("atmos_goals", JSON.stringify(apiGoals));
        } else {
          const localGoals = localStorage.getItem("atmos_goals");
          if (localGoals) {
            setGoals(JSON.parse(localGoals) as { targetPercent: number; targetAnnualKg: number });
          }
        }

        setOfflineMode(false);
      } catch (err) {
        console.warn("Express server offline. Falling back to local Storage persistence mode.", err);
        setOfflineMode(true);

        const localProf = localStorage.getItem("atmos_profile");
        const localActs = localStorage.getItem("atmos_activities");
        const localGoals = localStorage.getItem("atmos_goals");

        if (localProf) {
          const parsed = JSON.parse(localProf) as UserProfile;
          setProfile(parsed);
          const { dailyBudgetKg } = calculateOnboardingFootprint(parsed);
          setDailyBudget(dailyBudgetKg);
        }
        if (localActs) {
          setActivities(JSON.parse(localActs) as ActivityLog[]);
        }
        if (localGoals) {
          setGoals(JSON.parse(localGoals) as { targetPercent: number; targetAnnualKg: number });
        }
      } finally {
        const localAdopted = localStorage.getItem("atmos_adopted_actions");
        if (localAdopted) {
          setAdoptedActions(JSON.parse(localAdopted) as ActionPlanItem[]);
        }
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // 2. Onboarding Complete Handler
  const handleOnboardingComplete = useCallback(async (newProfile: UserProfile, startingBudget: number, annualFootprint: number): Promise<void> => {
    setLoading(true);
    setProfile(newProfile);
    setDailyBudget(startingBudget);
    setGoals({ targetPercent: 15, targetAnnualKg: annualFootprint * 0.85 });

    localStorage.setItem("atmos_profile", JSON.stringify(newProfile));
    localStorage.setItem("atmos_goals", JSON.stringify({ targetPercent: 15, targetAnnualKg: annualFootprint * 0.85 }));

    if (!offlineMode) {
      try {
        await api.saveProfile(newProfile);
        await api.saveGoals({ targetPercent: 15, targetAnnualKg: annualFootprint * 0.85 });
      } catch (err) {
        console.error("Failed to sync onboarding to server:", err);
      }
    }
    setLoading(false);
  }, [offlineMode]);

  // 3. Add Activity Transaction
  const handleAddActivity = useCallback(async (act: Omit<ActivityLog, "id" | "emissions">): Promise<void> => {
    if (offlineMode) {
      const { calculateEmissions } = await import("../lib/emissionFactors");
      const clientEmissions = calculateEmissions(act.category, act.type, act.value, profile?.country || "US");

      const newAct: ActivityLog = {
        id: `act_${Date.now()}`,
        emissions: clientEmissions,
        ...act
      };
      const updated = [newAct, ...activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(updated);
      localStorage.setItem("atmos_activities", JSON.stringify(updated));
    } else {
      const response = await api.addActivity(act);
      const updated = [response.activity, ...activities].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(updated);
      localStorage.setItem("atmos_activities", JSON.stringify(updated));
    }
  }, [offlineMode, activities, profile]);

  // 4. Update Activity Transaction
  const handleUpdateActivity = useCallback(async (id: string, act: Omit<ActivityLog, "id" | "emissions">): Promise<void> => {
    if (offlineMode) {
      const { calculateEmissions } = await import("../lib/emissionFactors");
      const clientEmissions = calculateEmissions(act.category, act.type, act.value, profile?.country || "US");

      const updated = activities.map((a) => {
        if (a.id === id) {
          return { ...a, ...act, emissions: clientEmissions };
        }
        return a;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(updated);
      localStorage.setItem("atmos_activities", JSON.stringify(updated));
    } else {
      const response = await api.updateActivity(id, act);
      const updated = activities.map((a) => (a.id === id ? response.activity : a))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivities(updated);
      localStorage.setItem("atmos_activities", JSON.stringify(updated));
    }
  }, [offlineMode, activities, profile]);

  // 5. Delete Activity Transaction
  const handleDeleteActivity = useCallback(async (id: string): Promise<void> => {
    const updated = activities.filter((a) => a.id !== id);
    setActivities(updated);
    localStorage.setItem("atmos_activities", JSON.stringify(updated));

    if (!offlineMode) {
      try {
        await api.deleteActivity(id);
      } catch (err) {
        console.error("Failed to delete activity on server:", err);
      }
    }
  }, [offlineMode, activities]);

  // 6. Update Goals Configuration
  const handleUpdateGoals = useCallback(async (newGoals: { targetPercent: number; targetAnnualKg: number }): Promise<void> => {
    setGoals(newGoals);
    const daily = Number((newGoals.targetAnnualKg / 365).toFixed(1));
    setDailyBudget(daily);

    localStorage.setItem("atmos_goals", JSON.stringify(newGoals));

    if (!offlineMode) {
      try {
        await api.saveGoals(newGoals);
      } catch (err) {
        console.error("Failed to save goals on server:", err);
      }
    }
  }, [offlineMode]);

  // 7. Adopt action plan checklist item
  const handleAdoptAction = useCallback((action: ActionPlanItem): void => {
    if (adoptedActions.some((a) => a.id === action.id)) return;
    const updated = [action, ...adoptedActions];
    setAdoptedActions(updated);
    localStorage.setItem("atmos_adopted_actions", JSON.stringify(updated));
    setActiveTab("actions");
  }, [adoptedActions]);

  const handleRemoveAdopted = useCallback((id: string): void => {
    const updated = adoptedActions.filter((a) => a.id !== id);
    setAdoptedActions(updated);
    localStorage.setItem("atmos_adopted_actions", JSON.stringify(updated));
  }, [adoptedActions]);

  const handleCompleteActionLog = useCallback((id: string, co2Saved: number): void => {
    console.log(`Action completed: ${id}, CO2 saved: ${co2Saved}kg`);
  }, []);

  // 8. Log Out / Reset Ledger Profile
  const handleResetProfile = useCallback((): void => {
    localStorage.clear();
    setProfile(null);
    setActivities([]);
    setAdoptedActions([]);
    setGoals({ targetPercent: 15, targetAnnualKg: 0 });
    setActiveTab("dashboard");
    window.location.reload();
  }, []);

  // 9. Log streak calculation
  const streakCount = useMemo((): number => {
    if (activities.length === 0) return 0;
    const loggedDates = Array.from(new Set(activities.map((a) => a.date))).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
    const todayStr = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    if (loggedDates[0] !== todayStr && loggedDates[0] !== yesterdayStr) return 0;

    let count = 1;
    const expected = new Date(loggedDates[0]);
    for (let i = 1; i < loggedDates.length; i++) {
      expected.setDate(expected.getDate() - 1);
      const expStr = expected.toISOString().split("T")[0];
      if (loggedDates[i] === expStr) count++;
      else break;
    }
    return count;
  }, [activities]);

  return {
    profile, activities, goals, dailyBudget, adoptedActions, streakCount,
    loading, offlineMode, activeTab, mobileMenuOpen, showResetConfirm, isEditingProfile,
    setActiveTab, setMobileMenuOpen, setShowResetConfirm, setIsEditingProfile,
    handleOnboardingComplete, handleAddActivity, handleUpdateActivity,
    handleDeleteActivity, handleUpdateGoals, handleAdoptAction,
    handleRemoveAdopted, handleCompleteActionLog, handleResetProfile,
  };
}
