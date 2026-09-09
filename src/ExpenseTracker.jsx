import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, X, Trash2, Search, Download, Pencil, ArrowUpDown, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const INK = "#1A1A2E";
const INK_SOFT = "#3C4A66";
const PAPER = "#FDF6E3";
const PAPER_LINE = "#DCD3BE";
const BRASS = "#B98A4A";
const RED = "#B4472F";
const GREEN = "#4F7859";

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Other",
];

const STORAGE_KEY = "ledger:transactions";
const BUDGETS_KEY = "ledger:budgets";

const PALETTE = ["#B98A4A", "#8A6FA8", "#4F7859", "#3C6E91", "#B4472F", "#8C8560", "#6B4F3A"];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatAmount(n) {
  const abs = Math.abs(n);
  return abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function monthLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseTracker() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date"); // "date" | "amount"
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [budgetDraft, setBudgetDraft] = useState({ category: "Food", amount: "" });
  const downloadRef = useRef(null);

  const [draft, setDraft] = useState({
    description: "",
    amount: "",
    category: "Food",
    date: todayISO(),
    kind: "expense",
  });

  // Load
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) setTransactions(JSON.parse(res.value));
      } catch (e) {
        // key not found yet, or storage unavailable — start empty
      }
      try {
        const res2 = await window.storage.get(BUDGETS_KEY, false);
        if (res2 && res2.value) setBudgets(JSON.parse(res2.value));
      } catch (e) {
        // no budgets set yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (next) => {
    setTransactions(next);
    try {
      const ok = await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      if (!ok) setLoadError(true);
    } catch (e) {
      setLoadError(true);
    }
  };

  const persistBudgets = async (next) => {
    setBudgets(next);
    try {
      await window.storage.set(BUDGETS_KEY, JSON.stringify(next), false);
    } catch (e) {
      setLoadError(true);
    }
  };

  const resetDraft = () =>
    setDraft({ description: "", amount: "", category: "Food", date: todayISO(), kind: "expense" });

  const handleAdd = () => {
    const amt = parseFloat(draft.amount);
    if (!draft.description.trim() || isNaN(amt) || amt <= 0) return;
    const entry = {
      id: uid(),
      description: draft.description.trim(),
      amount: draft.kind === "expense" ? -Math.abs(amt) : Math.abs(amt),
      category: draft.kind === "income" ? "Income" : draft.category,
      date: draft.date || todayISO(),
    };
    const next = [entry, ...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
    persist(next);
    resetDraft();
    setAdding(false);
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setAdding(false);
    setDraft({
      description: t.description,
      amount: String(Math.abs(t.amount)),
      category: t.amount < 0 ? t.category : "Food",
      date: t.date,
      kind: t.amount < 0 ? "expense" : "income",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetDraft();
  };

  const handleSaveEdit = () => {
    const amt = parseFloat(draft.amount);
    if (!draft.description.trim() || isNaN(amt) || amt <= 0) return;
    const next = transactions
      .map((t) =>
        t.id === editingId
          ? {
              ...t,
              description: draft.description.trim(),
              amount: draft.kind === "expense" ? -Math.abs(amt) : Math.abs(amt),
              category: draft.kind === "income" ? "Income" : draft.category,
              date: draft.date || todayISO(),
            }
          : t
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    persist(next);
    cancelEdit();
  };

  const handleDelete = (id) => {
    persist(transactions.filter((t) => t.id !== id));
    if (editingId === id) cancelEdit();
  };

  const handleSetBudget = () => {
    const amt = parseFloat(budgetDraft.amount);
    if (isNaN(amt) || amt <= 0) return;
    persistBudgets({ ...budgets, [budgetDraft.category]: amt });
    setBudgetDraft({ category: "Food", amount: "" });
  };

  const handleRemoveBudget = (cat) => {
    const next = { ...budgets };
    delete next[cat];
    persistBudgets(next);
  };

  const handleExportCSV = () => {
    const header = "Date,Description,Category,Amount\n";
    const rows = transactions
      .map((t) => `${t.date},"${t.description.replace(/"/g, '""')}",${t.category},${t.amount.toFixed(2)}`)
      .join("\n");
    const csv = header + rows;
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = downloadRef.current;
      a.href = url;
      a.download = "ledger-export.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      // download not supported in this environment
    }
  };

  const { income, expenses, balance } = useMemo(() => {
    let inc = 0,
      exp = 0;
    for (const t of transactions) {
      if (t.amount >= 0) inc += t.amount;
      else exp += -t.amount;
    }
    return { income: inc, expenses: exp, balance: inc - exp };
  }, [transactions]);

  const currentMonthKey = todayISO().slice(0, 7);

  const spendByCategory = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (t.amount < 0 && t.date.slice(0, 7) === currentMonthKey) {
        map[t.category] = (map[t.category] || 0) + -t.amount;
      }
    }
    return map;
  }, [transactions, currentMonthKey]);

  const chartData = useMemo(
    () =>
      Object.entries(spendByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    [spendByCategory]
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filter === "Income") list = list.filter((t) => t.amount >= 0);
    else if (filter !== "All") list = list.filter((t) => t.category === filter && t.amount < 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.description.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "amount") return Math.abs(b.amount) - Math.abs(a.amount);
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }, [transactions, filter, search, sortBy]);

  const grouped = useMemo(() => {
    if (sortBy === "amount") return [["all", filtered]];
    const groups = {};
    for (const t of filtered) {
      const key = t.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered, sortBy]);

  const usedCategories = useMemo(() => {
    const set = new Set(transactions.filter((t) => t.amount < 0).map((t) => t.category));
    return CATEGORIES.filter((c) => set.has(c));
  }, [transactions]);

  return (
    <div
      className="w-full min-h-screen flex justify-center"
      style={{ background: INK, fontFamily: "'Inter', ui-sans-serif, system-ui" }}
    >
      <div className="w-full max-w-3xl px-5 py-10 md:py-14">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <div
              className="text-xs tracking-wide mb-1"
              style={{ color: BRASS, letterSpacing: "0.04em" }}
            >
              Personal ledger
            </div>
            <h1
              style={{
                fontFamily: "'Source Serif 4', Georgia, serif",
                color: PAPER,
                fontSize: "2.1rem",
                lineHeight: 1.1,
              }}
            >
              This month's balance
            </h1>
          </div>
        </div>

        {/* Balance card */}
        <div
          className="rounded-sm p-6 md:p-8 mb-8"
          style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 mb-6">
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "2.6rem",
                color: balance < 0 ? RED : INK,
                fontWeight: 500,
              }}
            >
              {balance < 0 ? "-" : ""}₹{formatAmount(balance)}
            </span>
            <span style={{ color: INK_SOFT, fontSize: "0.9rem" }}>net balance</span>
          </div>

          <div className="grid grid-cols-2 gap-6" style={{ borderTop: `1px solid ${PAPER_LINE}`, paddingTop: "1.25rem" }}>
            <div>
              <div className="text-xs mb-1" style={{ color: INK_SOFT }}>
                Income
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: GREEN,
                  fontSize: "1.25rem",
                }}
              >
                +₹{formatAmount(income)}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: INK_SOFT }}>
                Expenses
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: RED,
                  fontSize: "1.25rem",
                }}
              >
                -₹{formatAmount(expenses)}
              </div>
            </div>
          </div>
        </div>

        {/* Category insight */}
        {chartData.length > 0 && (
          <div
            className="rounded-sm p-5 mb-6"
            style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
          >
            <div className="text-xs mb-3" style={{ color: INK_SOFT }}>
              Spending by category — this month
            </div>
            <div style={{ width: "100%", height: Math.max(120, chartData.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={90}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: INK_SOFT, fontSize: 12, fontFamily: "Inter" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(27,42,74,0.05)" }}
                    formatter={(v) => [`₹${formatAmount(v)}`, "Spent"]}
                    contentStyle={{
                      background: INK,
                      border: "none",
                      borderRadius: 2,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: PAPER }}
                    itemStyle={{ color: PAPER }}
                  />
                  <Bar dataKey="amount" radius={[0, 2, 2, 0]} barSize={16}>
                    {chartData.map((entry, i) => (
                      <Cell key={entry.category} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Budgets */}
        <div
          className="rounded-sm p-5 mb-6"
          style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} color={BRASS} />
            <div className="text-xs" style={{ color: INK_SOFT }}>
              Monthly budgets
            </div>
          </div>

          {Object.keys(budgets).length === 0 && (
            <div className="text-sm mb-3" style={{ color: "rgba(60,74,102,0.6)" }}>
              Set a budget per category to track how this month is going.
            </div>
          )}

          <div className="flex flex-col gap-3 mb-4">
            {Object.entries(budgets).map(([cat, cap]) => {
              const spent = spendByCategory[cat] || 0;
              const pct = Math.min(100, (spent / cap) * 100);
              const over = spent > cap;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: INK, fontSize: "0.85rem" }}>{cat}</span>
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: "0.78rem",
                          color: over ? RED : INK_SOFT,
                        }}
                      >
                        ₹{formatAmount(spent)} / ₹{formatAmount(cap)}
                      </span>
                      <button onClick={() => handleRemoveBudget(cat)} style={{ color: "rgba(60,74,102,0.4)" }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                  <div
                    className="w-full rounded-sm overflow-hidden"
                    style={{ height: 6, background: PAPER_LINE }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: over ? RED : BRASS,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={budgetDraft.category}
              onChange={(e) => setBudgetDraft((b) => ({ ...b, category: e.target.value }))}
              className="px-2 py-1.5 rounded-sm text-sm outline-none"
              style={{ background: "white", border: `1px solid ${PAPER_LINE}`, color: INK }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Budget amount"
              value={budgetDraft.amount}
              onChange={(e) => setBudgetDraft((b) => ({ ...b, amount: e.target.value }))}
              className="px-2 py-1.5 rounded-sm text-sm outline-none w-32"
              style={{
                background: "white",
                border: `1px solid ${PAPER_LINE}`,
                color: INK,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
            <button
              onClick={handleSetBudget}
              className="px-3 py-1.5 rounded-sm text-sm"
              style={{ background: INK, color: PAPER, fontWeight: 600 }}
            >
              Set budget
            </button>
          </div>
        </div>

        {/* Toolbar: search, sort, filter, export, add */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm flex-1 min-w-[160px]"
            style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
          >
            <Search size={14} color={INK_SOFT} />
            <input
              type="text"
              placeholder="Search entries"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent outline-none text-sm flex-1"
              style={{ color: INK }}
            />
          </div>
          <button
            onClick={() => setSortBy((s) => (s === "date" ? "amount" : "date"))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm"
            style={{ border: `1px solid ${PAPER_LINE}`, color: "rgba(246,241,231,0.7)" }}
            title="Toggle sort"
          >
            <ArrowUpDown size={13} />
            {sortBy === "date" ? "Date" : "Amount"}
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm"
            style={{ border: `1px solid ${PAPER_LINE}`, color: "rgba(246,241,231,0.7)" }}
          >
            <Download size={13} />
            Export
          </button>
          <a ref={downloadRef} className="hidden" />
          <button
            onClick={() => {
              cancelEdit();
              setAdding((a) => !a);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm"
            style={{ background: BRASS, color: INK, fontWeight: 600 }}
          >
            {adding ? <X size={15} /> : <Plus size={15} />}
            {adding ? "Cancel" : "New entry"}
          </button>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {["All", "Income", ...usedCategories].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className="px-3 py-1 rounded-sm text-sm transition-colors"
              style={{
                border: `1px solid ${filter === c ? BRASS : PAPER_LINE}`,
                color: filter === c ? BRASS : "rgba(246,241,231,0.6)",
                background: "transparent",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Add / edit entry form */}
        {(adding || editingId) && (
          <div
            className="rounded-sm p-4 mb-6"
            style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setDraft((d) => ({ ...d, kind: "expense" }))}
                  className="px-3 py-1 rounded-sm text-xs"
                  style={{
                    background: draft.kind === "expense" ? RED : "transparent",
                    color: draft.kind === "expense" ? PAPER : INK_SOFT,
                    border: `1px solid ${draft.kind === "expense" ? RED : PAPER_LINE}`,
                  }}
                >
                  Expense
                </button>
                <button
                  onClick={() => setDraft((d) => ({ ...d, kind: "income" }))}
                  className="px-3 py-1 rounded-sm text-xs"
                  style={{
                    background: draft.kind === "income" ? GREEN : "transparent",
                    color: draft.kind === "income" ? PAPER : INK_SOFT,
                    border: `1px solid ${draft.kind === "income" ? GREEN : PAPER_LINE}`,
                  }}
                >
                  Income
                </button>
              </div>
              {editingId && (
                <span style={{ color: INK_SOFT, fontSize: "0.78rem" }}>Editing entry</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <input
                type="text"
                placeholder="Description"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="md:col-span-2 px-3 py-2 rounded-sm text-sm outline-none"
                style={{ background: "white", border: `1px solid ${PAPER_LINE}`, color: INK }}
              />
              <input
                type="number"
                placeholder="Amount"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                className="px-3 py-2 rounded-sm text-sm outline-none"
                style={{
                  background: "white",
                  border: `1px solid ${PAPER_LINE}`,
                  color: INK,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                className="px-3 py-2 rounded-sm text-sm outline-none"
                style={{ background: "white", border: `1px solid ${PAPER_LINE}`, color: INK }}
              />
            </div>

            {draft.kind === "expense" && (
              <div className="flex gap-2 flex-wrap mb-3">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft((d) => ({ ...d, category: c }))}
                    className="px-2.5 py-1 rounded-sm text-xs"
                    style={{
                      background: draft.category === c ? INK : "transparent",
                      color: draft.category === c ? PAPER : INK_SOFT,
                      border: `1px solid ${draft.category === c ? INK : PAPER_LINE}`,
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={editingId ? handleSaveEdit : handleAdd}
                className="px-4 py-2 rounded-sm text-sm"
                style={{ background: INK, color: PAPER, fontWeight: 600 }}
              >
                {editingId ? "Save changes" : "Add to ledger"}
              </button>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 rounded-sm text-sm"
                  style={{ border: `1px solid ${PAPER_LINE}`, color: INK_SOFT }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Transactions */}
        {loaded && grouped.length === 0 && (
          <div
            className="rounded-sm p-8 text-center"
            style={{ border: `1px dashed ${PAPER_LINE}`, color: "rgba(246,241,231,0.5)" }}
          >
            {transactions.length === 0
              ? "No entries yet. Add your first one above."
              : "No entries match this filter."}
          </div>
        )}

        {grouped.map(([month, entries]) => (
          <div key={month} className="mb-7">
            {month !== "all" && (
              <div
                className="text-xs mb-2 px-1"
                style={{ color: "rgba(246,241,231,0.45)", letterSpacing: "0.03em" }}
              >
                {monthLabel(entries[0].date)}
              </div>
            )}
            <div
              className="rounded-sm overflow-hidden"
              style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}
            >
              {entries.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => startEdit(t)}
                  className="group flex items-center gap-3 px-4 py-3 cursor-pointer"
                  style={{
                    borderTop: i === 0 ? "none" : `1px solid ${PAPER_LINE}`,
                    background: editingId === t.id ? "rgba(185,138,74,0.08)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: INK_SOFT,
                      fontSize: "0.78rem",
                      width: "3.2rem",
                      flexShrink: 0,
                    }}
                  >
                    {formatDate(t.date)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: INK, fontSize: "0.92rem" }} className="truncate">
                      {t.description}
                    </div>
                  </div>
                  <div
                    className="px-2 py-0.5 rounded-sm text-xs flex-shrink-0 hidden sm:block"
                    style={{
                      color: INK_SOFT,
                      border: `1px solid ${PAPER_LINE}`,
                    }}
                  >
                    {t.category}
                  </div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: t.amount < 0 ? RED : GREEN,
                      fontSize: "0.95rem",
                      width: "5.5rem",
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {t.amount < 0 ? "-" : "+"}₹{formatAmount(t.amount)}
                  </div>
                  <Pencil
                    size={13}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: INK_SOFT }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: RED }}
                    aria-label="Delete entry"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {loadError && (
          <div className="text-center text-xs mt-4" style={{ color: "rgba(246,241,231,0.4)" }}>
            Entries are kept for this session only — storage isn't available right now.
          </div>
        )}
      </div>
    </div>
  );
}
