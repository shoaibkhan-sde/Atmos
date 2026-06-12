/**
 * ATMOS EMISSION FACTORS & CALCULATIONS ENGINE
 * 
 * Sources:
 * - Greenhouse Gas Protocol (GHGP)
 * - UK Department for Environment, Food & Rural Affairs (DEFRA 2023)
 * - US Environmental Protection Agency (EPA GHG Emission Factors Hub 2023)
 * - IPCC (Intergovernmental Panel on Climate Change)
 */

// Grid electricity intensities (kg CO2e per kWh)
export const GRID_INTENSITIES: Record<string, number> = {
  // Coal-heavy grids
  "IN": 0.82, // India
  "ZA": 0.90, // South Africa
  "CN": 0.62, // China
  "PL": 0.70, // Poland
  // Average / mixed grids
  "US": 0.38, // United States
  "DE": 0.35, // Germany
  "GB": 0.22, // United Kingdom
  "JP": 0.45, // Japan
  "AU": 0.68, // Australia
  "EU_AVG": 0.25, // European Union Average
  // Clean / renewable-heavy grids
  "FR": 0.05, // France (nuclear)
  "NO": 0.01, // Norway (hydroelectric)
  "SE": 0.02, // Sweden (nuclear/hydro)
  "CA": 0.12, // Canada (hydroelectric heavy)
  "IS": 0.00, // Iceland (geothermal/hydro)
  // Default fallback
  "GLOBAL_AVG": 0.475,
};

// Transport emission factors (kg CO2e per km)
export const TRANSPORT_FACTORS: Record<string, number> = {
  "car_petrol": 0.18,      // Average petrol car (EPA)
  "car_diesel": 0.17,      // Average diesel car (DEFRA)
  "car_hybrid": 0.10,      // Hybrid car (e.g., Prius)
  "car_electric": 0.05,    // EV average (grid-lifecycle, ~50g/km)
  "public_bus": 0.08,      // Average bus ride per passenger-km
  "public_train": 0.03,    // Average rail ride per passenger-km
  "flight_short": 0.25,    // Flight < 1500 km (high takeoff penalty per km)
  "flight_medium": 0.20,   // Flight 1500 - 3700 km
  "flight_long": 0.15,     // Flight > 3700 km
  "cycling_walking": 0.0,  // Zero tailpipe emissions
};

// Diet annual footprints (kg CO2e per year)
export const DIET_FACTORS: Record<string, number> = {
  "meat_heavy": 3300,  // Daily: ~9.0 kg CO2e
  "average": 2500,     // Daily: ~6.8 kg CO2e
  "vegetarian": 1700,  // Daily: ~4.6 kg CO2e
  "vegan": 1500,       // Daily: ~4.1 kg CO2e
};

// Consumption factors (kg CO2e per unit/kg)
export const CONSUMPTION_FACTORS: Record<string, number> = {
  "clothing": 15.0,     // Average garment manufacturing & distribution lifecycle
  "electronics": 80.0,  // Smartphone/laptop average production lifecycle
  "general_goods": 5.0, // General retail goods per kg
};

// Waste factors (kg CO2e per kg of waste)
export const WASTE_FACTORS: Record<string, number> = {
  "landfill": 0.50,   // Mixed waste sent to landfill (methane emissions)
  "recycling": 0.10,  // Processing emissions for recycled materials
  "composting": 0.05, // Organic waste composting emissions
};

// Home Energy fuel factors (kg CO2e per unit)
export const ENERGY_FACTORS: Record<string, number> = {
  "natural_gas": 1.90, // per cubic meter (m3)
  "heating_oil": 2.70, // per liter (L)
};

// Profile types for Onboarding
export interface UserProfile {
  country: string;
  householdSize: number;
  primaryTransport: string; // car_petrol, public, electric, active, etc.
  weeklyTransportKm: number;
  dietType: string;         // meat_heavy, average, vegetarian, vegan
  electricityKwh: number;   // monthly household electricity
  heatingType: string;      // natural_gas, heating_oil, electric, none
  heatingQty: number;       // monthly household heating qty (m3, L, or kWh if electric)
  recycleCompost: boolean;  // waste practice
}

// Activity types for Logged Transactions
export interface ActivityLog {
  id: string;
  date: string; // YYYY-MM-DD
  category: "Transport" | "Energy" | "Food" | "Shopping" | "Waste";
  type: string; // e.g., 'car_petrol', 'flight_short', 'meat_heavy', etc.
  value: number; // e.g., distance in km, meals in count, items in count, kg in waste
  emissions: number; // Calculated kg CO2e
  note?: string; // Optional description
}

/**
 * Calculates emissions for a single activity.
 * Returns emissions in kg CO2e.
 */
export function calculateEmissions(
  category: ActivityLog["category"],
  type: string,
  value: number,
  countryCode: string = "US"
): number {
  if (value <= 0) return 0;

  switch (category) {
    case "Transport": {
      const transportFactor = TRANSPORT_FACTORS[type] ?? 0;
      return Number((value * transportFactor).toFixed(2));
    }

    case "Energy": {
      if (type === "electricity") {
        const intensity = GRID_INTENSITIES[countryCode] ?? GRID_INTENSITIES["GLOBAL_AVG"];
        return Number((value * intensity).toFixed(2));
      } else {
        const energyFactor = ENERGY_FACTORS[type] ?? 0;
        return Number((value * energyFactor).toFixed(2));
      }
    }

    case "Food": {
      // Diet values are usually processed as number of days.
      // A daily rate is computed as annual rate / 365.
      const annualDietFootprint = DIET_FACTORS[type] ?? DIET_FACTORS["average"];
      const dailyDietFootprint = annualDietFootprint / 365;
      return Number((value * dailyDietFootprint).toFixed(2));
    }

    case "Shopping": {
      const shoppingFactor = CONSUMPTION_FACTORS[type] ?? 0;
      return Number((value * shoppingFactor).toFixed(2));
    }

    case "Waste": {
      const wasteFactor = WASTE_FACTORS[type] ?? 0;
      return Number((value * wasteFactor).toFixed(2));
    }

    default:
      return 0;
  }
}

/**
 * Estimates the starting annual carbon footprint (in kg CO2e) for a user based on onboarding questions.
 * Also computes a recommended daily budget (in kg CO2e).
 */
export function calculateOnboardingFootprint(profile: UserProfile): {
  annualFootprintKg: number;
  dailyBudgetKg: number;
} {
  const householdSize = Math.max(1, profile.householdSize);

  // 1. Food footprint (individual)
  const annualFoodFootprint = DIET_FACTORS[profile.dietType] ?? DIET_FACTORS["average"];

  // 2. Transport footprint (individual based on weekly km)
  let transportFactor: number;
  if (profile.primaryTransport === "public") {
    transportFactor = TRANSPORT_FACTORS["public_bus"]; // Use bus as average transit
  } else if (profile.primaryTransport === "electric") {
    transportFactor = TRANSPORT_FACTORS["car_electric"];
  } else if (profile.primaryTransport === "active") {
    transportFactor = TRANSPORT_FACTORS["cycling_walking"];
  } else {
    // default to car petrol
    transportFactor = TRANSPORT_FACTORS["car_petrol"];
  }
  const annualTransportFootprint = profile.weeklyTransportKm * 52 * transportFactor;

  // 3. Home Electricity footprint (split by household size)
  const gridIntensity = GRID_INTENSITIES[profile.country] ?? GRID_INTENSITIES["GLOBAL_AVG"];
  const annualElectricityFootprint = (profile.electricityKwh * 12 * gridIntensity) / householdSize;

  // 4. Home Heating footprint (split by household size)
  let annualHeatingFootprint = 0;
  if (profile.heatingType === "electric") {
    // Heating uses electricity, using grid intensity
    annualHeatingFootprint = (profile.heatingQty * 12 * gridIntensity) / householdSize;
  } else if (profile.heatingType !== "none") {
    const heatingFactor = ENERGY_FACTORS[profile.heatingType] ?? 0;
    annualHeatingFootprint = (profile.heatingQty * 12 * heatingFactor) / householdSize;
  }

  // 5. Waste footprint (estimated average modified by recycling)
  // Average waste per person is about 450kg/year. If they recycle/compost, we assume 70% is diverted.
  const baseWasteKg = 450;
  let annualWasteFootprint = baseWasteKg * WASTE_FACTORS["landfill"]; // 225 kg CO2e
  if (profile.recycleCompost) {
    // 70% recycled (0.10 factor), 30% landfill (0.50 factor)
    annualWasteFootprint = (baseWasteKg * 0.70 * WASTE_FACTORS["recycling"]) + 
                           (baseWasteKg * 0.30 * WASTE_FACTORS["landfill"]); // 31.5 + 67.5 = 99 kg CO2e
  }

  // Total annual footprint in kg
  const annualFootprintKg = Math.round(
    annualFoodFootprint +
    annualTransportFootprint +
    annualElectricityFootprint +
    annualHeatingFootprint +
    annualWasteFootprint
  );

  // Daily budget calculation:
  // We want to set a target budget that is ambitious but achievable.
  // The daily baseline is onboarding annual footprint / 365.
  // We'll set a budget that cuts 15% from their baseline, or caps it at 15 kg/day
  // to avoid setting extreme budgets. The Paris Target is ~6.3 kg/day (2.3 tons/year).
  const baselineDaily = annualFootprintKg / 365;
  
  // Reduce by 15% for starting budget, bounded between Paris target (6.3 kg) and a maximum of 25 kg.
  let dailyBudgetKg = Number((baselineDaily * 0.85).toFixed(1));
  if (dailyBudgetKg < 6.3) dailyBudgetKg = 6.3;
  if (dailyBudgetKg > 25.0) dailyBudgetKg = 25.0;

  return {
    annualFootprintKg,
    dailyBudgetKg
  };
}
