export interface UserProfile {
  country: string;
  householdSize: number;
  primaryTransport: string;
  weeklyTransportKm: number;
  dietType: string;
  electricityKwh: number;
  heatingType: string;
  heatingQty: number;
  recycleCompost: boolean;
}

export interface ActivityLog {
  id: string;
  date: string;
  category: "Transport" | "Energy" | "Food" | "Shopping" | "Waste";
  type: string;
  value: number;
  emissions: number;
  note?: string;
}

export interface ActionPlanItem {
  id: string;
  title: string;
  description: string;
  co2SavedKg: number;
  category: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface AtmosCoachResponse {
  insight: string;
  actionPlan: ActionPlanItem[];
  goalCoaching: string;
  usingFallback: boolean;
}

export interface DBState {
  profile: UserProfile | null;
  activities: ActivityLog[];
  goals: {
    targetPercent: number;
    targetAnnualKg: number;
  };
  achievements: string[];
}
