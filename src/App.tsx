import { useState, useEffect, useMemo, Suspense } from "react";
import { UserProfile, ActivityLog, calculateOnboardingFootprint } from "./lib/emissionFactors";
import { ActionPlanItem } from "./lib/localInsights";
import { api } from "./services/api";
import { Onboarding } from "./components/Onboarding";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CardSkeleton } from "./components/Skeleton";
import { Dashboard } from "./components/Dashboard";
import { ActivityLogger } from "./components/ActivityLogger";
import { AtmosCoach } from "./components/AtmosCoach";
import { Goals } from "./components/Goals";
import { ActionsList } from "./components/ActionsList";
import { Reports } from "./components/Reports";

import { 
  Leaf, 
  LayoutDashboard, 
  ClipboardList, 
  MessageSquareCode, 
  Target, 
  CheckSquare, 
  FileBarChart2, 
  LogOut, 
  WifiOff,
  Menu,
  X,
  Settings
} from "lucide-react";

function App() {
  // Global States
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [goals, setGoals] = useState<{ targetPercent: number; targetAnnualKg: number }>({ targetPercent: 15, targetAnnualKg: 0 });
  const [dailyBudget, setDailyBudget] = useState<number>(12);
  const [adoptedActions, setAdoptedActions] = useState<ActionPlanItem[]>([]);
  
  // App Infrastructure States
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "activities" | "coach" | "goals" | "actions" | "reports">("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // 1. Initial State Load (Sync API -> LocalStorage Fallback)
  useEffect(() => {
    const initApp = async () => {
      try {
        // Fetch from Express Server Backend
        const [apiProfile, apiActivities, apiGoals] = await Promise.all([
          api.getProfile(),
          api.getActivities(),
          api.getGoals(),
        ]);

        if (apiProfile) {
          setProfile(apiProfile);
          // Calculate starting budget from profile
          const { dailyBudgetKg } = calculateOnboardingFootprint(apiProfile);
          setDailyBudget(apiGoals?.targetAnnualKg ? Number((apiGoals.targetAnnualKg / 365).toFixed(1)) : dailyBudgetKg);
          
          // Sync localStorage backup
          localStorage.setItem("atmos_profile", JSON.stringify(apiProfile));
        } else {
          // Check local storage fallback
          const localProf = localStorage.getItem("atmos_profile");
          if (localProf) {
            const parsed = JSON.parse(localProf);
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
            setGoals(JSON.parse(localGoals));
          }
        }

        setOfflineMode(false);
      } catch (err) {
        console.warn("Express server offline. Falling back to local Storage persistence mode.", err);
        setOfflineMode(true);
        
        // Load Backup Local Storage
        const localProf = localStorage.getItem("atmos_profile");
        const localActs = localStorage.getItem("atmos_activities");
        const localGoals = localStorage.getItem("atmos_goals");

        if (localProf) {
          const parsed = JSON.parse(localProf);
          setProfile(parsed);
          const { dailyBudgetKg } = calculateOnboardingFootprint(parsed);
          setDailyBudget(dailyBudgetKg);
        }
        if (localActs) {
          setActivities(JSON.parse(localActs));
        }
        if (localGoals) {
          setGoals(JSON.parse(localGoals));
        }
      } finally {
        // Load adopted actions checklist
        const localAdopted = localStorage.getItem("atmos_adopted_actions");
        if (localAdopted) {
          setAdoptedActions(JSON.parse(localAdopted));
        }
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // 2. Onboarding Complete Handler
  const handleOnboardingComplete = async (newProfile: UserProfile, startingBudget: number, annualFootprint: number) => {
    setLoading(true);
    setProfile(newProfile);
    setDailyBudget(startingBudget);
    setGoals({ targetPercent: 15, targetAnnualKg: annualFootprint * 0.85 });

    // Backup to localStorage
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
  };

  // 3. Add Activity Transaction
  const handleAddActivity = async (act: Omit<ActivityLog, "id" | "emissions">) => {
    if (offlineMode) {
      // Offline calculation logic
      // Better: import calculateEmissions client-side!
      const { calculateEmissions } = await import("./lib/emissionFactors");
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
  };

  // 4. Update Activity Transaction
  const handleUpdateActivity = async (id: string, act: Omit<ActivityLog, "id" | "emissions">) => {
    if (offlineMode) {
      const { calculateEmissions } = await import("./lib/emissionFactors");
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
  };

  // 5. Delete Activity Transaction
  const handleDeleteActivity = async (id: string) => {
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
  };

  // 6. Update Goals Configuration
  const handleUpdateGoals = async (newGoals: { targetPercent: number; targetAnnualKg: number }) => {
    setGoals(newGoals);
    // Recalculate daily budget from targetAnnualKg
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
  };

  // 7. Adopt action plan checklist item
  const handleAdoptAction = (action: ActionPlanItem) => {
    if (adoptedActions.some((a) => a.id === action.id)) return;
    const updated = [action, ...adoptedActions];
    setAdoptedActions(updated);
    localStorage.setItem("atmos_adopted_actions", JSON.stringify(updated));
    setActiveTab("actions"); // redirect to checklist to view it
  };

  const handleRemoveAdopted = (id: string) => {
    const updated = adoptedActions.filter((a) => a.id !== id);
    setAdoptedActions(updated);
    localStorage.setItem("atmos_adopted_actions", JSON.stringify(updated));
  };

  const handleCompleteActionLog = (id: string, co2Saved: number) => {
    // Check off completed action. Real-time updates daily budget or completes a log entry.
    // For Atmos, completed items update the dashboard projected calculations directly.
    console.log(`Action completed: ${id}, CO2 saved: ${co2Saved}kg`);
  };

  // 8. Log Out / Reset Ledger Profile
  const handleResetProfile = () => {
    if (window.confirm("Are you sure you want to reset your ledger? This will erase your profile and activities.")) {
      localStorage.clear();
      setProfile(null);
      setActivities([]);
      setAdoptedActions([]);
      setGoals({ targetPercent: 15, targetAnnualKg: 0 });
      setActiveTab("dashboard");
      
      // Attempt backend reset if possible, otherwise reload page
      window.location.reload();
    }
  };

  // 9. Log streak calculation
  const streakCount = useMemo(() => {
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

  // Render Loader screen
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="space-y-4 flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-accent-teal/10 border border-accent-teal/30 flex items-center justify-center text-accent-teal animate-spin">
            <Leaf size={24} />
          </div>
          <span className="text-sm font-semibold tracking-wider text-muted font-mono uppercase">Syncing ledger states...</span>
        </div>
      </div>
    );
  }

  // Render Onboarding flow if profile doesn't exist
  if (!profile) {
    return (
      <ErrorBoundary>
        <Onboarding 
          onComplete={handleOnboardingComplete} 
        />
      </ErrorBoundary>
    );
  }

  // Render Onboarding flow in edit mode if user clicks the sidebar profile widget
  if (isEditingProfile) {
    return (
      <ErrorBoundary>
        <Onboarding 
          initialProfile={profile}
          onComplete={async (updatedProfile, dailyBudget, annualFootprint) => {
            await handleOnboardingComplete(updatedProfile, dailyBudget, annualFootprint);
            setIsEditingProfile(false);
          }}
          onCancel={() => setIsEditingProfile(false)}
        />
      </ErrorBoundary>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
    { id: "activities", label: "Transactions", icon: <ClipboardList size={16} /> },
    { id: "coach", label: "Atmos Coach", icon: <MessageSquareCode size={16} /> },
    { id: "goals", label: "Goals", icon: <Target size={16} /> },
    { id: "actions", label: "Checklist", icon: <CheckSquare size={16} /> },
    { id: "reports", label: "Reports", icon: <FileBarChart2 size={16} /> },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background flex flex-col md:flex-row relative">
        {/* Mobile Navbar Header */}
        <header className="md:hidden flex justify-between items-center bg-surface border-b border-border p-4 z-20 w-full">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-r from-accent-teal to-cyan-500 flex items-center justify-center text-background">
              <Leaf size={16} />
            </div>
            <span className="font-bold tracking-tight text-white font-tabular text-base">ATMOS</span>
          </div>
          
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 border border-border rounded text-muted hover:text-white"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>

        {/* Sidebar Navigation */}
        <nav className={`
          fixed md:relative top-0 bottom-0 left-0 w-64 bg-surface border-r border-border p-5 flex flex-col justify-between z-30 transition-transform duration-300 md:translate-x-0
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:block"}
        `}>
          <div className="space-y-8">
            {/* Branded Logo */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-border/80">
              <div className="w-8 h-8 rounded bg-gradient-to-r from-accent-teal to-cyan-500 flex items-center justify-center text-background animate-pulse">
                <Leaf size={18} />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight text-white font-tabular block">ATMOS</span>
                <span className="text-[9px] font-mono text-muted uppercase tracking-widest block">Carbon Ledger</span>
              </div>
            </div>

            {/* Offline Alert Badge */}
            {offlineMode && (
              <div className="p-3 bg-accent-amber/5 border border-accent-amber/20 rounded-lg flex items-center gap-2 text-[10px] text-accent-amber font-mono">
                <WifiOff size={14} className="shrink-0" />
                <span>Running Offline (Local DB)</span>
              </div>
            )}

            {/* Navigation List Links */}
            <ul className="space-y-1.5" role="menu">
              {navItems.map((item) => (
                <li key={item.id} role="none">
                  <button
                    onClick={() => {
                      setActiveTab(item.id as "dashboard" | "activities" | "coach" | "goals" | "actions" | "reports");
                      setMobileMenuOpen(false);
                    }}
                    role="menuitem"
                    aria-current={activeTab === item.id ? "page" : undefined}
                    className={`
                      w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 outline-none
                      ${
                        activeTab === item.id
                          ? "bg-accent-teal/10 border-l-4 border-accent-teal text-white"
                          : "text-muted hover:bg-border/30 hover:text-white"
                      }
                    `}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer Navigation (Profile actions) */}
          <div className="space-y-4 border-t border-border pt-4">
            <button
              onClick={() => setIsEditingProfile(true)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/60 hover:border-accent-teal/40 bg-surface/40 hover:bg-border/20 text-left transition-all group cursor-pointer outline-none"
              aria-label="Edit Household Profile and Region"
            >
              <div className="w-8 h-8 rounded-full bg-border group-hover:bg-accent-teal/10 border border-muted/20 group-hover:border-accent-teal/30 flex items-center justify-center text-xs font-bold text-white group-hover:text-accent-teal uppercase transition-colors shrink-0">
                {profile.country}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white group-hover:text-accent-teal truncate transition-colors">
                  Region: {profile.country}
                </p>
                <p className="text-[10px] text-muted truncate">Size: {profile.householdSize} {profile.householdSize === 1 ? "person" : "persons"}</p>
              </div>
              <Settings size={14} className="text-muted group-hover:text-accent-teal transition-colors shrink-0 animate-pulse" />
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-semibold text-muted hover:text-rose-400 hover:bg-rose-950/20 border border-transparent hover:border-rose-900/30 transition-all"
            >
              <LogOut size={14} className="text-rose-500/80" />
              Reset Account Ledger
            </button>
          </div>
        </nav>

        {/* Backdrop overlay for mobile menu */}
        {mobileMenuOpen && (
          <div 
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 md:hidden z-20"
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
          <Suspense fallback={<CardSkeleton />}>
            {activeTab === "dashboard" && (
              <Dashboard 
                profile={profile} 
                activities={activities} 
                dailyBudget={dailyBudget} 
                onNavigate={(tab) => {
                  if (
                    tab === "dashboard" ||
                    tab === "activities" ||
                    tab === "coach" ||
                    tab === "goals" ||
                    tab === "actions" ||
                    tab === "reports"
                  ) {
                    setActiveTab(tab);
                  }
                }}
              />
            )}
            
            {activeTab === "activities" && (
              <ActivityLogger 
                activities={activities} 
                onAddActivity={handleAddActivity}
                onUpdateActivity={handleUpdateActivity}
                onDeleteActivity={handleDeleteActivity}
              />
            )}

            {activeTab === "coach" && (
              <AtmosCoach 
                profile={profile} 
                activities={activities} 
                onAdoptAction={handleAdoptAction}
              />
            )}

            {activeTab === "goals" && (
              <Goals 
                profile={profile} 
                activities={activities} 
                currentGoals={goals} 
                onUpdateGoals={handleUpdateGoals}
              />
            )}

            {activeTab === "actions" && (
              <ActionsList 
                adoptedActions={adoptedActions} 
                streak={streakCount} 
                onCompleteAction={handleCompleteActionLog}
                onRemoveAdopted={handleRemoveAdopted}
              />
            )}

            {activeTab === "reports" && (
              <Reports 
                profile={profile} 
                activities={activities} 
                dailyBudget={dailyBudget} 
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <div className="ledger-card max-w-md w-full p-6 space-y-6 border border-rose-500/25 bg-surface shadow-2xl shadow-rose-950/20">
            <div className="space-y-2 text-center sm:text-left">
              <h3 id="reset-confirm-title" className="text-lg font-bold text-white flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-rose-500">⚠️</span> Reset Account Ledger?
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                This action is permanent. It will delete your profile preferences, target budget goals, and erase all logged carbon transaction history.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="ledger-btn-secondary py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowResetConfirm(false);
                  await handleResetProfile();
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs"
              >
                Reset Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}

export default App;
