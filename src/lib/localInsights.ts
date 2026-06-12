import { ActivityLog, UserProfile, GRID_INTENSITIES } from "./emissionFactors";

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

/**
 * Helper to aggregate activities by category.
 */
function getCategoryTotals(activities: ActivityLog[]): Record<string, number> {
  const totals: Record<string, number> = {
    Transport: 0,
    Energy: 0,
    Food: 0,
    Shopping: 0,
    Waste: 0,
  };
  activities.forEach((act) => {
    if (totals[act.category] !== undefined) {
      totals[act.category] += act.emissions;
    }
  });
  return totals;
}

/**
 * Main generator for local insights.
 */
export function generateLocalCoachData(
  activities: ActivityLog[],
  profile: UserProfile,
  goalPercent: number = 15
): AtmosCoachResponse {
  const totals = getCategoryTotals(activities);
  const totalEmissions = Object.values(totals).reduce((a, b) => a + b, 0);

  // 1. Identify the single biggest category
  let maxCategory = "Food";
  let maxEmissions = 0;
  Object.entries(totals).forEach(([cat, val]) => {
    if (val > maxEmissions) {
      maxEmissions = val;
      maxCategory = cat;
    }
  });

  const percent = totalEmissions > 0 ? Math.round((maxEmissions / totalEmissions) * 100) : 0;

  // 2. Generate Insight text based on max category and data
  let insight: string;
  if (totalEmissions === 0) {
    insight = `Welcome to Atmos, your personal carbon ledger! Your profile indicates that your biggest projected driver is likely ${
      profile.primaryTransport.includes("car") ? "driving commuting" : "home energy usage"
    }. Log your first activity using the quick-add panel above to start tracking real-time transactions.`;
  } else {
    switch (maxCategory) {
      case "Transport":
        insight = `Your single largest emission source is Transportation, making up ${percent}% of your total ledger. This is driven by vehicle usage. Commuting by car averages about 0.18 kg CO2e/km, meaning even short trips add up quickly.`;
        break;
      case "Energy":
        insight = `Home Energy is currently your largest carbon expense at ${percent}% of your ledger. Grid electricity in some regions is carbon-intensive, and heating fuel releases significant carbon dioxide. Small adjustments to heating or appliance efficiency can make a massive difference.`;
        break;
      case "Food":
        insight = `Diet and Food choices represent your largest emission driver at ${percent}% of your ledger. Meat production (especially beef) has a high lifecycle carbon intensity. Swapping just a few meals for plant-based alternatives will significantly improve your ledger balance.`;
        break;
      case "Shopping":
        insight = `Consumer purchases make up ${percent}% of your carbon ledger. Manufacturing items like electronics (~80kg CO2e) or garments (~15kg CO2e) requires substantial energy. Extending the lifespan of your items is key to saving carbon.`;
        break;
      case "Waste":
        insight = `Waste decomposition represents ${percent}% of your emissions. Landfills emit methane, a greenhouse gas 28 times more potent than CO2. Sorting your organics for composting and recycling reduces landfill volumes and carbon output.`;
        break;
      default:
        insight = `Your activity ledger shows steady logging. Your biggest driver is ${maxCategory} (${percent}%). Prioritizing reductions in this category offers your shortest path to meeting your reduction goals.`;
    }
  }

  // 3. Create Action Plan
  const actionPlan: ActionPlanItem[] = [];

  // Default actions based on profile/logs
  if (profile.primaryTransport.includes("car") || totals.Transport > 10) {
    actionPlan.push({
      id: "action_transit",
      title: "Replace 2 Car Commutes",
      description: "Switch 2 driving commutes to public transit or active travel (walking/cycling).",
      co2SavedKg: 12.5,
      category: "Transport",
      difficulty: "Medium",
    });
  }

  if (profile.dietType === "meat_heavy" || profile.dietType === "average" || totals.Food > 5) {
    actionPlan.push({
      id: "action_diet",
      title: "Meat-Free Weekdays",
      description: "Eat plant-based meals during the weekdays, reserving meat for weekends.",
      co2SavedKg: 18.0,
      category: "Food",
      difficulty: "Easy",
    });
  }

  if (profile.electricityKwh > 200 || totals.Energy > 15) {
    actionPlan.push({
      id: "action_energy",
      title: "Unplug Vampire Electronics",
      description: "Use smart power strips or unplug TV, gaming consoles, and microwave when not in use.",
      co2SavedKg: 4.2,
      category: "Energy",
      difficulty: "Easy",
    });
    actionPlan.push({
      id: "action_thermostat",
      title: "Adjust Thermostat 1°C",
      description: "Lower your heating by 1°C in winter, or raise your A/C by 1°C in summer.",
      co2SavedKg: 9.5,
      category: "Energy",
      difficulty: "Easy",
    });
  }

  if (actionPlan.length < 3) {
    actionPlan.push({
      id: "action_shopping",
      title: "Delay Tech Upgrades",
      description: "Extend your phone or laptop lifecycle by one additional year instead of upgrading.",
      co2SavedKg: 80.0,
      category: "Shopping",
      difficulty: "Medium",
    });
    actionPlan.push({
      id: "action_air_dry",
      title: "Air-Dry Your Laundry",
      description: "Skip the electric dryer cycle and hang clothes to dry on a drying rack.",
      co2SavedKg: 2.1,
      category: "Energy",
      difficulty: "Easy",
    });
  }

  // Limit to 3-5 items sorted by savings
  const finalActionPlan = actionPlan
    .sort((a, b) => b.co2SavedKg - a.co2SavedKg)
    .slice(0, 5);

  // 4. Generate Goal Coaching
  let goalCoaching: string;
  if (totalEmissions === 0) {
    goalCoaching = `Setting a goal of ${goalPercent}% reduction is a great start! Once you begin tracking, Atmos will compare your trajectory against this milestone.`;
  } else {
    // Check daily budget vs actuals.
    // Calculate a daily average based on logged activities (or assume daily budget)
    const uniqueDays = Array.from(new Set(activities.map((a) => a.date))).length || 1;
    const dailyAverage = totalEmissions / uniqueDays;
    const estimatedDailyBudget = profile.electricityKwh ? (calculateLocalOnboardingFootprint(profile) / 365) * (1 - goalPercent/100) : 12;

    if (dailyAverage <= estimatedDailyBudget) {
      goalCoaching = `Excellent work! Your daily average of ${dailyAverage.toFixed(1)} kg CO2e is below your target budget of ${estimatedDailyBudget.toFixed(1)} kg CO2e. You are currently on track to exceed your ${goalPercent}% reduction goal. Keep logging to lock in your success!`;
    } else {
      const overAmount = dailyAverage - estimatedDailyBudget;
      goalCoaching = `You are averaging ${dailyAverage.toFixed(1)} kg CO2e per day, which is ${overAmount.toFixed(1)} kg above your target of ${estimatedDailyBudget.toFixed(1)} kg. Swapping car commutes for public transit or adopting a vegetarian lunch could instantly close this gap and return you to your target trajectory.`;
    }
  }

  return {
    insight,
    actionPlan: finalActionPlan,
    goalCoaching,
    usingFallback: true,
  };
}

/**
 * Simple onboarding calculator helper for local use.
 */
function calculateLocalOnboardingFootprint(p: UserProfile): number {
  const size = Math.max(1, p.householdSize);
  const food = p.dietType === "meat_heavy" ? 3300 : p.dietType === "average" ? 2500 : p.dietType === "vegetarian" ? 1700 : 1500;
  const transFactor = p.primaryTransport === "public" ? 0.08 : p.primaryTransport === "electric" ? 0.05 : p.primaryTransport === "active" ? 0 : 0.18;
  const trans = p.weeklyTransportKm * 52 * transFactor;
  const intensity = GRID_INTENSITIES[p.country] ?? 0.38;
  const elec = (p.electricityKwh * 12 * intensity) / size;
  const heatFactor = p.heatingType === "natural_gas" ? 1.9 : p.heatingType === "heating_oil" ? 2.7 : p.heatingType === "electric" ? intensity : 0;
  const heat = (p.heatingQty * 12 * heatFactor) / size;
  const waste = p.recycleCompost ? 99 : 225;
  return food + trans + elec + heat + waste;
}

/**
 * Generates local chat response using keyword analysis.
 */
export function generateLocalChatResponse(
  query: string,
  activities: ActivityLog[]
): string {
  const q = query.toLowerCase();
  const totals = getCategoryTotals(activities);
  const totalEmissions = Object.values(totals).reduce((a, b) => a + b, 0);

  if (q.includes("vegetarian") || q.includes("vegan") || q.includes("diet") || q.includes("food") || q.includes("eat")) {
    const vegDaily = 1700 / 365;
    const meatDaily = 3300 / 365;
    const savings = meatDaily - vegDaily;
    return `Adopting a vegetarian diet cuts your diet footprint by roughly 48% (saving ~${savings.toFixed(1)} kg CO2e per day compared to a meat-heavy diet). Swapping a red-meat meal for beans, lentils, or tofu is one of the most effective direct carbon reduction steps. In a year, going vegetarian saves about 1.6 metric tons of CO2e — equivalent to planting 26 trees!`;
  }

  if (q.includes("car") || q.includes("commute") || q.includes("drive") || q.includes("transit") || q.includes("bus") || q.includes("train")) {
    return `Let's look at the math: driving an average petrol car emits roughly 0.18 kg CO2e per km. Taking public transit emits just 0.04 to 0.08 kg per passenger-km — a 60-80% reduction! Walking or cycling emits 0 kg. If your weekly commute is 100 km, switching to public transit saves about 10-14 kg CO2e every week.`;
  }

  if (q.includes("why") && (q.includes("high") || q.includes("increase") || q.includes("up"))) {
    if (totalEmissions === 0) {
      return `Your carbon ledger is currently empty. Once you log transactions (such as driving, ordering items, or daily diet), we can analyze what is driving your footprint upward.`;
    }
    // Find highest category
    let maxCat = "";
    let maxVal = 0;
    Object.entries(totals).forEach(([c, v]) => {
      if (v > maxVal) {
        maxVal = v;
        maxCat = c;
      }
    });
    return `Your ledger shows a total of ${totalEmissions.toFixed(1)} kg CO2e logged. The primary driver of this is ${maxCat}, which accounts for ${maxVal.toFixed(1)} kg CO2e (approx ${Math.round((maxVal/totalEmissions)*100)}% of your footprint). To lower your footprint, prioritize reducing activities in ${maxCat} first.`;
  }

  if (q.includes("action") || q.includes("reduce") || q.includes("help") || q.includes("tip")) {
    return `To reduce your carbon footprint effectively, focus on the big three areas:
1. **Transportation**: Walk or bike for trips under 2 km, carpool, or take public transit.
2. **Home Energy**: Switch to LED bulbs, adjust your thermostat by 1°C, and use cold cycles for laundry.
3. **Food**: Try "Meat-Free Mondays". Plant-based proteins have a fraction of the carbon cost of beef.`;
  }

  if (q.includes("budget") || q.includes("limit") || q.includes("ledger")) {
    const uniqueDays = Array.from(new Set(activities.map((a) => a.date))).length || 1;
    const dailyAverage = totalEmissions / uniqueDays;
    return `Atmos frames carbon tracking like a financial ledger. You have a daily budget (usually 8-15 kg CO2e). Every activity you log is a "debit" against this budget. Your daily average is currently ${dailyAverage.toFixed(1)} kg CO2e. Staying under your daily budget ensures you match your long-term reduction goals.`;
  }

  // Default response
  return `Atmos Coach here! I can help you analyze your carbon ledger. You have logged ${totalEmissions.toFixed(1)} kg CO2e across ${activities.length} transactions. Feel free to ask about:
- "How can I reduce my commute emissions?"
- "What if I went vegetarian?"
- "Why is my carbon footprint high?"
- "How does the carbon budget system work?"`;
}
