import React, { useState, useMemo } from "react";
import { ActivityLog } from "../lib/emissionFactors";
import { Plus, Trash2, Edit2, Search, Flame, Zap, ArrowLeft, ArrowRight } from "lucide-react";

interface ActivityLoggerProps {
  activities: ActivityLog[];
  onAddActivity: (act: Omit<ActivityLog, "id" | "emissions">) => Promise<void>;
  onUpdateActivity: (id: string, act: Omit<ActivityLog, "id" | "emissions">) => Promise<void>;
  onDeleteActivity: (id: string) => Promise<void>;
}

export const ActivityLogger: React.FC<ActivityLoggerProps> = ({
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
}) => {
  // UI states
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState<ActivityLog["category"]>("Transport");
  const [type, setType] = useState("car_petrol");
  const [value, setValue] = useState<number>(15);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Types map based on Category
  const typeOptions = useMemo(() => {
    switch (category) {
      case "Transport":
        return [
          { value: "car_petrol", label: "Gasoline Car Commute (km)" },
          { value: "car_diesel", label: "Diesel Car Commute (km)" },
          { value: "car_hybrid", label: "Hybrid Car Commute (km)" },
          { value: "car_electric", label: "Electric Vehicle Commute (km)" },
          { value: "public_bus", label: "Transit Bus Journey (km)" },
          { value: "public_train", label: "Transit Train Journey (km)" },
          { value: "flight_short", label: "Short-Haul Flight < 1500km (km)" },
          { value: "flight_medium", label: "Medium-Haul Flight < 3700km (km)" },
          { value: "flight_long", label: "Long-Haul Flight > 3700km (km)" },
          { value: "cycling_walking", label: "Active Commute (km)" },
        ];
      case "Energy":
        return [
          { value: "electricity", label: "Grid Electricity (kWh)" },
          { value: "natural_gas", label: "Natural Gas Heating (m3)" },
          { value: "heating_oil", label: "Heating Oil (Liters)" },
        ];
      case "Food":
        return [
          { value: "meat_heavy", label: "Meat-Heavy Diet (Days)" },
          { value: "average", label: "Average Diet (Days)" },
          { value: "vegetarian", label: "Vegetarian Diet (Days)" },
          { value: "vegan", label: "Vegan Diet (Days)" },
        ];
      case "Shopping":
        return [
          { value: "clothing", label: "Clothing Items Purchased (Items)" },
          { value: "electronics", label: "Consumer Electronics (Items)" },
          { value: "general_goods", label: "General Goods Purchased (kg/Items)" },
        ];
      case "Waste":
        return [
          { value: "landfill", label: "Mixed Landfill Waste (kg)" },
          { value: "recycling", label: "Recycled Materials (kg)" },
          { value: "composting", label: "Composted Organics (kg)" },
        ];
      default:
        return [];
    }
  }, [category]);

  // Category sync is now handled directly in the onChange handler to avoid React effect re-render triggers.

  // 1. Quick Add Handler
  const handleQuickAdd = async (
    qCat: ActivityLog["category"],
    qType: string,
    qVal: number,
    qNote: string
  ) => {
    setLoading(true);
    setError("");
    try {
      await onAddActivity({
        date: new Date().toISOString().split("T")[0],
        category: qCat,
        type: qType,
        value: qVal,
        note: qNote,
      });
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to log quick-add.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Custom Form Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (value <= 0) {
      setError("Please enter a quantity greater than zero.");
      return;
    }
    setLoading(true);

    try {
      if (isEditing) {
        await onUpdateActivity(isEditing, { date, category, type, value, note });
        setIsEditing(null);
      } else {
        await onAddActivity({ date, category, type, value, note });
      }
      // Reset form
      setNote("");
      setValue(category === "Food" ? 1 : 10);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to save transaction.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Edit Trigger
  const startEdit = (act: ActivityLog) => {
    setIsEditing(act.id);
    setDate(act.date);
    setCategory(act.category);
    setTimeout(() => {
      setType(act.type);
      setValue(act.value);
      setNote(act.note || "");
    }, 0);
  };

  const cancelEdit = () => {
    setIsEditing(null);
    setNote("");
    setValue(10);
  };

  // 4. Streak Counter Calculation
  const streak = useMemo(() => {
    if (activities.length === 0) return 0;

    // Get sorted unique logging dates
    const loggedDates = Array.from(new Set(activities.map((a) => a.date))).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );

    const todayStr = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Check if user has logged today or yesterday to preserve the streak
    if (loggedDates[0] !== todayStr && loggedDates[0] !== yesterdayStr) {
      return 0;
    }

    let currentStreak = 1;
    const expectedDate = new Date(loggedDates[0]);

    for (let i = 1; i < loggedDates.length; i++) {
      const actualDate = new Date(loggedDates[i]);
      expectedDate.setDate(expectedDate.getDate() - 1);
      const expectedStr = expectedDate.toISOString().split("T")[0];
      const actualStr = actualDate.toISOString().split("T")[0];

      if (actualStr === expectedStr) {
        currentStreak++;
      } else {
        break; // Streak broken
      }
    }
    return currentStreak;
  }, [activities]);

  // 5. Filtering and Searching
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const matchSearch =
        act.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        act.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        act.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCategory = categoryFilter === "All" || act.category === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [activities, searchTerm, categoryFilter]);

  // 6. Pagination Calculations
  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredActivities.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredActivities, currentPage]);

  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage) || 1;

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  return (
    <section className="space-y-6" aria-label="Transaction Ledger">
      {/* Header and Streak Counter */}
      <div className="flex justify-between items-center bg-surface border border-border p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-white">Activity transaction ledger</h2>
          <p className="text-xs text-muted">Log daily activities as debits against your carbon budget.</p>
        </div>
        
        {/* Streak Indicator */}
        <div 
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500 font-bold font-tabular"
          role="status"
          aria-label={`Current login streak: ${streak} days`}
        >
          <Flame className="animate-pulse" size={18} fill="currentColor" />
          <span>{streak} Day Streak</span>
        </div>
      </div>

      {/* Quick Add Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Quick debit transaction</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button
            onClick={() => handleQuickAdd("Transport", "car_petrol", 20, "20km Car Commute")}
            disabled={loading}
            className="ledger-card p-4 hover:border-accent-teal/50 text-center flex flex-col items-center justify-center space-y-2 group transition-all"
          >
            <Zap className="text-accent-teal group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-bold text-white block">Drive to Work</span>
            <span className="text-[10px] font-mono text-muted">20 km (3.6kg)</span>
          </button>
          
          <button
            onClick={() => handleQuickAdd("Transport", "public_train", 30, "30km Train Journey")}
            disabled={loading}
            className="ledger-card p-4 hover:border-accent-teal/50 text-center flex flex-col items-center justify-center space-y-2 group transition-all"
          >
            <Zap className="text-cyan-500 group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-bold text-white block">Take the Train</span>
            <span className="text-[10px] font-mono text-muted">30 km (0.9kg)</span>
          </button>

          <button
            onClick={() => handleQuickAdd("Food", "vegan", 1, "Vegan Diet Day")}
            disabled={loading}
            className="ledger-card p-4 hover:border-accent-teal/50 text-center flex flex-col items-center justify-center space-y-2 group transition-all"
          >
            <Zap className="text-emerald-500 group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-bold text-white block">Ate Vegan</span>
            <span className="text-[10px] font-mono text-muted">(4.1kg)</span>
          </button>

          <button
            onClick={() => handleQuickAdd("Food", "meat_heavy", 1, "Meat heavy Meal Day")}
            disabled={loading}
            className="ledger-card p-4 hover:border-accent-teal/50 text-center flex flex-col items-center justify-center space-y-2 group transition-all"
          >
            <Zap className="text-accent-red group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-bold text-white block">Standard Diet</span>
            <span className="text-[10px] font-mono text-muted">(9.0kg)</span>
          </button>

          <button
            onClick={() => handleQuickAdd("Shopping", "clothing", 1, "Garment purchase")}
            disabled={loading}
            className="ledger-card p-4 hover:border-accent-teal/50 text-center flex flex-col items-center justify-center space-y-2 group col-span-2 sm:col-span-1 transition-all"
          >
            <Zap className="text-purple-500 group-hover:scale-110 transition-transform" size={20} />
            <span className="text-xs font-bold text-white block">New Clothes</span>
            <span className="text-[10px] font-mono text-muted">(15.0kg)</span>
          </button>
        </div>
      </div>

      {/* Main Forms and List layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Custom Logger Form */}
        <div className="lg:col-span-1 ledger-card h-fit space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-base font-bold text-white">
              {isEditing ? "Modify Transaction" : "Log custom activity"}
            </h3>
            {isEditing && (
              <button 
                onClick={cancelEdit}
                className="text-xs text-accent-red hover:underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="log-date" className="text-xs font-semibold text-muted">Transaction Date</label>
              <input
                id="log-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ledger-input font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="log-category" className="text-xs font-semibold text-muted">Category</label>
              <select
                id="log-category"
                value={category}
                onChange={(e) => {
                  const newCat = e.target.value as ActivityLog["category"];
                  setCategory(newCat);
                  
                  let defaultType = "";
                  let defaultValue = 10;
                  if (newCat === "Transport") {
                    defaultType = "car_petrol";
                    defaultValue = 15;
                  } else if (newCat === "Energy") {
                    defaultType = "electricity";
                    defaultValue = 50;
                  } else if (newCat === "Food") {
                    defaultType = "meat_heavy";
                    defaultValue = 1;
                  } else if (newCat === "Shopping") {
                    defaultType = "clothing";
                    defaultValue = 1;
                  } else if (newCat === "Waste") {
                    defaultType = "landfill";
                    defaultValue = 5;
                  }
                  setType(defaultType);
                  setValue(defaultValue);
                }}
                className="ledger-input"
              >
                <option value="Transport">Transport</option>
                <option value="Energy">Energy</option>
                <option value="Food">Food & Diet</option>
                <option value="Shopping">Shopping & Goods</option>
                <option value="Waste">Waste disposal</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="log-type" className="text-xs font-semibold text-muted">Activity Type</label>
              <select
                id="log-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="ledger-input"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="log-value" className="text-xs font-semibold text-muted">Quantity</label>
              <input
                id="log-value"
                type="number"
                step="any"
                min="0.01"
                value={value || ""}
                onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                className="ledger-input font-tabular"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="log-note" className="text-xs font-semibold text-muted">Description/Note (Optional)</label>
              <input
                id="log-note"
                type="text"
                placeholder="e.g. Work commute, Weekly grocery shop"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="ledger-input"
              />
            </div>

            {error && <p className="text-xs text-accent-red font-medium">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="ledger-btn-primary w-full"
            >
              {isEditing ? "Update Entry" : "Post Transaction"}
              <Plus size={16} />
            </button>
          </form>
        </div>

        {/* Searchable Activity List Table */}
        <div className="lg:col-span-2 ledger-card flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <h3 className="text-base font-bold text-white">Transaction History Ledger</h3>
              
              <div className="flex gap-2 w-full sm:w-auto">
                {/* Search */}
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input
                    aria-label="Search activities"
                    type="text"
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="ledger-input pl-8 py-1.5 text-xs"
                  />
                </div>
                
                {/* Category Filter */}
                <select
                  aria-label="Filter category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="Transport">Transport</option>
                  <option value="Energy">Energy</option>
                  <option value="Food">Food</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Waste">Waste</option>
                </select>
              </div>
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto min-h-[360px]">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted text-xs">
                    <th className="py-2.5 font-semibold">Date</th>
                    <th className="py-2.5 font-semibold">Category</th>
                    <th className="py-2.5 font-semibold">Activity</th>
                    <th className="py-2.5 text-right font-semibold">Emissions</th>
                    <th className="py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs">
                  {paginatedActivities.length > 0 ? (
                    paginatedActivities.map((act) => (
                      <tr key={act.id} className="hover:bg-border/20 text-[#e2edea]">
                        <td className="py-3 font-mono">{act.date}</td>
                        <td className="py-3 font-semibold">{act.category}</td>
                        <td className="py-3">
                          <p className="font-medium">{act.note || act.type}</p>
                          <p className="text-[10px] text-muted font-tabular">Qty: {act.value}</p>
                        </td>
                        <td className="py-3 text-right font-bold text-accent-teal font-tabular">
                          {act.emissions.toFixed(1)} kg
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => startEdit(act)}
                              aria-label={`Edit log dated ${act.date}`}
                              className="p-1 hover:text-white rounded hover:bg-border/40 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => onDeleteActivity(act.id)}
                              aria-label={`Delete log dated ${act.date}`}
                              className="p-1 text-accent-red/80 hover:text-accent-red rounded hover:bg-border/40 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted">
                        No transactions match the search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <footer className="flex justify-between items-center border-t border-border/80 pt-4 mt-2">
              <span className="text-xs text-muted">
                Showing page {currentPage} of {totalPages} ({filteredActivities.length} logs)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="ledger-btn-secondary py-1 px-3 text-xs"
                >
                  <ArrowLeft size={12} />
                  Prev
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="ledger-btn-secondary py-1 px-3 text-xs"
                >
                  Next
                  <ArrowRight size={12} />
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </section>
  );
};

export default ActivityLogger;
