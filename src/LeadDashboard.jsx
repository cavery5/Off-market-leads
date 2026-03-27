import { useState, useMemo, useEffect } from "react";

const CURRENT_YEAR   = 2026;
const FOLLOWUP_DAYS  = 10;


const STATUS_OPTIONS = ["Not Contacted", "Letter Sent", "Called", "Responded", "Meeting Set", "Offer Made", "Dead"];

const STATUS_COLORS = {
  "Not Contacted": "#64748b",
  "Letter Sent":   "#3b82f6",
  "Called":        "#f59e0b",
  "Responded":     "#8b5cf6",
  "Meeting Set":   "#10b981",
  "Offer Made":    "#ef4444",
  "Dead":          "#374151",
};

const OWNER_TYPE_STYLES = {
  LLC:        { bg: "#1e3a5f", color: "#60a5fa" },
  Trust:      { bg: "#2d1b4e", color: "#a78bfa" },
  Estate:     { bg: "#3b1515", color: "#f87171" },
  Individual: { bg: "#1a2e1a", color: "#4ade80" },
};

// Defined outside component to avoid remounting on every render
function SortIcon({ field, sort }) {
  if (sort.field !== field) return <span style={{ color: "#2d3748" }}> ·</span>;
  return <span>{sort.dir === "asc" ? " ↑" : " ↓"}</span>;
}

// Scoring: up to 40 pts years held + 40 pts equity + 10 pts non-LLC + 10 pts absentee
function calcScore(equity, yearsOwned, ownerType, ownerAddress, propertyAddress) {
  let s = 0;
  s += Math.min(40, yearsOwned * 2);
  s += Math.min(40, Math.round(equity * 0.4));
  if (ownerType !== "LLC") s += 10;
  const propStreet = (propertyAddress || "").split(",")[0].trim().toLowerCase();
  if (propStreet && ownerAddress && !ownerAddress.toLowerCase().includes(propStreet)) s += 10;
  return Math.min(99, s);
}

function scoreColor(s) {
  return s >= 90 ? "#10b981" : s >= 75 ? "#f59e0b" : "#ef4444";
}

function scoreLabel(s) {
  return s >= 90 ? "🔥 HOT" : s >= 75 ? "⚡ WARM" : "❄ COLD";
}

const EMPTY_NEW_LEAD = {
  address: "", city: "Worcester", units: "", lastSale: "", lastPrice: "",
  assessed: "", ownerName: "", ownerAddress: "", ownerType: "Individual", phone: "", notes: "",
};

// ── CSV Import helpers ──────────────────────────────────────────────────────

// Maps various MassGIS / generic CSV column names to our internal field names
const COL_MAP = {
  address:      ["site_addr","address","addr","loc_addr","situs","property_address","street","full_str","prop_addr"],
  city:         ["city","town","municipality","muni"],
  units:        ["units","num_units","numunits","unit_count","bldg_units","res_units"],
  lastSale:     ["ls_date","lastsale","last_sale","last_sale_year","ls_year","sale_year","yr_sold","year_sold"],
  lastPrice:    ["ls_price","lastprice","last_price","sale_price","saleprice"],
  assessed:     ["total_val","assessed","totalval","assess_val","assd_val","assr_val","total_value","assessed_value"],
  ownerName:    ["owner1","ownername","owner_name","owner","own1","grantor"],
  ownerAddress: ["own_addr","owneraddress","owner_address","mail_addr","mailing_address","owner_addr"],
  ownerCity:    ["own_city","ownercity","mail_city","owner_city"],
  ownerState:   ["own_state","ownerstate","mail_state","owner_state"],
  ownerZip:     ["own_zip","ownerzip","mail_zip","owner_zip"],
  ownerType:    ["ownertype","owner_type","entity_type"],
  phone:        ["phone","telephone","phone_num"],
  lotSize:      ["lot_size","lotsf","lot_sf","lotsize","land_sf","shape_area"],
  yearBuilt:    ["year_built","yearbuilt","yr_built","yr_blt","bldg_year"],
  useCode:      ["use_code","usecode","use_cd","luc","land_use","prop_class"],
  notes:        ["notes","note","comments"],
};

function normalizeKey(k) { return k.toLowerCase().replace(/[^a-z0-9_]/g, ""); }

function detectColumns(headers) {
  const norm = headers.map(normalizeKey);
  const map  = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    const idx = norm.findIndex(h => aliases.some(a => a.toLowerCase() === h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

function parseCSVRow(line, delim = ",") {
  if (delim === "\t") return line.split("\t").map(f => f.trim());
  const fields = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

function inferOwnerType(name) {
  const n = (name || "").toUpperCase();
  if (/\bLLC\b|\bL\.L\.C\b|\bINC\b|\bCORP\b|\bLTD\b|\bLP\b/.test(n)) return "LLC";
  if (/\bTRUST\b|\bTRUSTEE\b/.test(n)) return "Trust";
  if (/\bESTATE\b/.test(n)) return "Estate";
  return "Individual";
}

function parseSaleYear(raw) {
  if (!raw) return 2010;
  const s = String(raw).trim();
  // MassGIS stores LS_DATE as YYYYMMDD integer (e.g. 20050615)
  if (/^\d{8}$/.test(s)) return parseInt(s.slice(0, 4), 10);
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : 2010;
}

function importCSV(text, currentYear) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { leads: [], errors: ["File appears empty or has no data rows."] };

  // Auto-detect delimiter: tab or comma
  const delim   = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseCSVRow(lines[0], delim);
  const colMap  = detectColumns(headers);
  console.log("[CSV import] delimiter:", JSON.stringify(delim));
  console.log("[CSV import] headers:", headers);
  console.log("[CSV import] colMap:", colMap);
  const errors  = [];
  const leads   = [];

  if (colMap.address === undefined) {
    errors.push("Could not find address column. Expected SITE_ADDR, ADDRESS, or similar.");
    return { leads, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCSVRow(lines[i], delim);

    const get = (field, fallback = "") => {
      const idx = colMap[field];
      return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : fallback;
    };

    const address = get("address");
    if (!address) continue;

    const units     = parseInt(get("units", "0"), 10) || 0;
    const lastSale  = parseSaleYear(get("lastSale"));
    const lastPrice = parseInt(get("lastPrice", "0").replace(/[^0-9]/g, ""), 10) || 0;
    const assessedRaw = get("assessed", "");
    if (i === 1) console.log("[CSV import] row1 assessed raw:", JSON.stringify(assessedRaw), "| row:", row.slice(0, 8));
    const assessed  = parseInt(assessedRaw.replace(/[^0-9]/g, ""), 10) || 0;
    const ownerName = get("ownerName");
    const ownerType = get("ownerType") || inferOwnerType(ownerName);
    const yearBuilt = parseInt(get("yearBuilt", "1970"), 10) || 1970;
    const useCode   = get("useCode", "");

    // LOT_SIZE in MassGIS is acres (e.g. 2.06) — convert to SF if < 100
    const lotRaw = parseFloat(get("lotSize", "0")) || 0;
    const lotSF  = lotRaw > 0 && lotRaw < 100 ? Math.round(lotRaw * 43560) : Math.round(lotRaw) || 8000;

    // Combine owner address parts (MassGIS splits into OWN_ADDR / OWN_CITY / OWN_STATE / OWN_ZIP)
    const ownerStreet = get("ownerAddress");
    const ownerCity   = get("ownerCity");
    const ownerState  = get("ownerState");
    const ownerZip    = get("ownerZip");
    const ownerAddress = [ownerStreet, ownerCity, ownerState, ownerZip].filter(Boolean).join(", ") || "";

    const yearsOwned = currentYear - lastSale;
    // lastPrice=0 is common in MA data (family transfers, inherited) — treat as unknown
    const equity = assessed > 0 && lastPrice > 0
      ? Math.max(0, Math.round(((assessed - lastPrice * 0.5) / assessed) * 100))
      : assessed > 0
        ? Math.min(95, Math.max(40, Math.round(40 + yearsOwned * 2)))  // estimate from hold time
        : 70;
    const score = calcScore(equity, yearsOwned, ownerType, ownerAddress, address);

    leads.push({
      id: Date.now() + i,
      address,
      city:         get("city", "Unknown"),
      units,
      lastSale,
      lastPrice,
      assessed,
      equity,
      score,
      ownerName,
      ownerAddress,
      ownerStreet,
      ownerCity,
      ownerState,
      ownerZip,
      ownerType: ["Individual","LLC","Trust","Estate"].includes(ownerType) ? ownerType : inferOwnerType(ownerName),
      phone:     get("phone"),
      notes:     get("notes"),
      status:    "Not Contacted",
      yearBuilt,
      lotSF,
      useCode,
    });
  }

  return { leads, errors };
}

const DEFAULT_FILTERS = {
  city: "All", minUnits: 0, maxUnits: 9999, maxPrice: 5000000, minEquity: 0,
  minYearsOwned: 0, ownerType: "All", status: "All", search: "",
};

export default function LeadDashboard() {
  const [leads, setLeads] = useState(() => {
    try { const s = localStorage.getItem("offmarket_leads"); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [filters, setFilters]   = useState(DEFAULT_FILTERS);
  const [sort, setSort]         = useState({ field: "score", dir: "desc" });
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [newLead, setNewLead]   = useState(EMPTY_NEW_LEAD);
  const [activeTab, setActiveTab]   = useState("leads");
  const [importResult, setImportResult] = useState(null); // { added, skipped, errors }
  const [importMode, setImportMode] = useState("append"); // "append" | "replace"
  const [campaign, setCampaign] = useState({ open: false, sending: false, results: null, type: "new" });
  const [selectedForMail, setSelectedForMail] = useState(new Set());

  useEffect(() => {
    try { localStorage.setItem("offmarket_leads", JSON.stringify(leads)); } catch {}
  }, [leads]);

  const cities     = useMemo(() => ["All", ...Array.from(new Set(leads.map(l => l.city))).sort()], [leads]);
  const ownerTypes = ["All", "Individual", "LLC", "Trust", "Estate"];

  const filtered = useMemo(() => {
    const data = leads.filter(l => {
      const yearsOwned = CURRENT_YEAR - l.lastSale;
      const estValue   = l.assessed * 1.1;
      if (filters.city      !== "All" && l.city      !== filters.city)      return false;
      if (l.units < filters.minUnits)                                        return false;
      if (l.units > filters.maxUnits)                                        return false;
      if (estValue > filters.maxPrice)                                       return false;
      if (l.equity < filters.minEquity)                                      return false;
      if (yearsOwned < filters.minYearsOwned)                                return false;
      if (filters.ownerType !== "All" && l.ownerType !== filters.ownerType) return false;
      if (filters.status    !== "All" && l.status    !== filters.status)    return false;
      if (filters.search && !`${l.address} ${l.city} ${l.ownerName}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });

    return [...data].sort((a, b) => {
      let av = a[sort.field];
      let bv = b[sort.field];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [leads, filters, sort]);

  // helpers — must come before stats and campaign derived values
  const daysSinceMailed = (lead) => {
    const hist = lead.mailHistory;
    if (!hist?.length) return null;
    return Math.floor((Date.now() - new Date(hist[hist.length - 1].sentAt).getTime()) / 86400000);
  };
  const currentRound = (lead) => lead.mailHistory?.length ?? 0;

  // campaign pools
  const hotUnmailed   = leads.filter(l => l.score >= 90 && !currentRound(l));
  const followUpReady = leads.filter(l => {
    if (!currentRound(l)) return false;
    if (["Responded", "Dead", "Offer Made"].includes(l.status)) return false;
    return daysSinceMailed(l) >= FOLLOWUP_DAYS;
  });

  const mailTargets     = selectedForMail.size > 0
    ? hotUnmailed.filter(l => selectedForMail.has(l.id))
    : hotUnmailed;
  const followUpTargets = selectedForMail.size > 0
    ? followUpReady.filter(l => selectedForMail.has(l.id))
    : followUpReady;

  const stats = useMemo(() => ({
    total:     leads.length,
    hot:       leads.filter(l => l.score >= 90).length,
    mailed:    leads.filter(l => currentRound(l) > 0).length,
    followUp:  followUpReady.length,
    contacted: leads.filter(l => l.status !== "Not Contacted" && l.status !== "Dead").length,
    meetings:  leads.filter(l => l.status === "Meeting Set").length,
    offers:    leads.filter(l => l.status === "Offer Made").length,
  }), [leads, followUpReady]);

  // Campaign modal derived values (at component level — esbuild rejects IIFEs in JSX)
  const campaignIsFollowUp = campaign.type === "followup";
  const campaignTargets    = campaignIsFollowUp ? followUpTargets : mailTargets;
  const campaignAccent     = campaignIsFollowUp ? "#f59e0b" : "#10b981";
  const campaignAccentDark = campaignIsFollowUp ? "#78350f" : "#064e3b";
  const campaignTitle      = campaignIsFollowUp ? "Send Follow-Up" : "Send Postcards";
  const campaignSubtitle   = campaignIsFollowUp
    ? `Round 2 follow-up — leads mailed ${FOLLOWUP_DAYS}+ days ago with no response`
    : "Round 1 outreach — 6×9 postcards via Lob to HOT unmailed leads";

  const toggleMailSelect = (id) => {
    setSelectedForMail(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const eligibleForSelect = [...hotUnmailed, ...followUpReady];
  const toggleSelectAll = () => {
    if (eligibleForSelect.every(l => selectedForMail.has(l.id))) {
      setSelectedForMail(new Set());
    } else {
      setSelectedForMail(new Set(eligibleForSelect.map(l => l.id)));
    }
  };

  const sendPostcards = async (type = "new") => {
    const targets = type === "followup" ? followUpTargets : mailTargets;
    setCampaign(c => ({ ...c, sending: true, results: null }));
    try {
      const res  = await fetch("/api/send-postcards", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ leads: targets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      const sentNow  = new Date().toISOString();
      const resultMap = Object.fromEntries(data.results.map(r => [r.id, r.lobId]));
      const sentIds  = data.results.filter(r => r.status === "sent").map(r => r.id);
      setLeads(prev => prev.map(l => {
        if (!sentIds.includes(l.id)) return l;
        const round = (l.mailHistory?.length ?? 0) + 1;
        return {
          ...l,
          mailHistory: [...(l.mailHistory || []), { round, sentAt: sentNow, lobId: resultMap[l.id] }],
          status: l.status === "Not Contacted" ? "Letter Sent" : l.status,
        };
      }));
      setSelectedForMail(new Set());
      setCampaign(c => ({ ...c, sending: false, results: data.results }));
    } catch (err) {
      setCampaign(c => ({ ...c, sending: false, results: [{ status: "failed", reason: err.message }] }));
    }
  };

  const updateLead = (id, field, value) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
    setSelected(prev => prev?.id === id ? { ...prev, [field]: value } : prev);
  };

  const addLead = () => {
    if (!newLead.address || !newLead.units) return;

    // Parse numeric fields before arithmetic to avoid NaN from string operations
    const assessed  = parseInt(newLead.assessed,  10) || 0;
    const lastPrice = parseInt(newLead.lastPrice, 10) || 0;
    const lastSale  = parseInt(newLead.lastSale,  10) || 2010;
    const units     = parseInt(newLead.units,     10);

    const equity = assessed && lastPrice
      ? Math.max(0, Math.round(((assessed - lastPrice * 0.5) / assessed) * 100))
      : 70;
    const yearsOwned = CURRENT_YEAR - lastSale;
    const ownerType = newLead.ownerType || "Individual";
    const score = calcScore(equity, yearsOwned, ownerType, newLead.ownerAddress || "", newLead.address || "");

    const lead = {
      ...newLead,
      id: Date.now(),
      units,
      lastSale,
      lastPrice,
      assessed,
      equity,
      score,
      status:    "Not Contacted",
      yearBuilt: 1970,
      lotSF:     8000,
      useCode:   "320",
    };

    setLeads(prev => [...prev, lead]);
    setNewLead(EMPTY_NEW_LEAD);
    setShowAdd(false);
  };

  const exportCSV = () => {
    const headers = [
      "Address","City","Units","Last Sale Year","Last Price","Assessed",
      "Equity %","Owner","Owner Address","Owner Type","Phone","Status","Score","Notes",
    ];
    const rows = filtered.map(l =>
      [l.address, l.city, l.units, l.lastSale, l.lastPrice, l.assessed,
       l.equity, l.ownerName, l.ownerAddress, l.ownerType, l.phone,
       l.status, l.score, l.notes]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "ma_multifamily_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (field) =>
    setSort(prev => ({ field, dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc" }));

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-imported
    const mode = importMode;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { leads: newLeads, errors } = importCSV(ev.target.result, CURRENT_YEAR);
      if (newLeads.length > 0) {
        if (mode === "replace") {
          setLeads(newLeads);
          setImportResult({ added: newLeads.length, skipped: 0, errors, replaced: true });
        } else {
          setLeads(prev => {
            const existingAddrs = new Set(prev.map(l => l.address.toLowerCase()));
            const fresh = newLeads.filter(l => !existingAddrs.has(l.address.toLowerCase()));
            setImportResult({ added: fresh.length, skipped: newLeads.length - fresh.length, errors });
            return [...prev, ...fresh];
          });
        }
      } else {
        setImportResult({ added: 0, skipped: 0, errors: errors.length ? errors : ["No valid leads found in file."] });
      }
    };
    reader.readAsText(file);
  };

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: "#0a0e1a", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Libre+Baskerville:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 3px; }
        input, select, textarea { font-family: inherit; }
        .row-hover:hover { background: #131929 !important; cursor: pointer; }
        .btn { cursor: pointer; border: none; font-family: inherit; font-size: 11px; letter-spacing: 0.08em; font-weight: 500; transition: all 0.15s; }
        .btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .tab-active { border-bottom: 2px solid #d4a843 !important; color: #d4a843 !important; }
        .filter-input { background: #131929; border: 1px solid #1e2d45; color: #e2e8f0; padding: 6px 10px; border-radius: 4px; font-size: 11px; width: 100%; }
        .filter-input:focus { outline: none; border-color: #d4a843; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: "#060b14", borderBottom: "1px solid #1e2d45", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d4a843", boxShadow: "0 0 8px #d4a843" }} />
            <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 15, fontWeight: 700, color: "#d4a843", letterSpacing: "0.05em" }}>MASSLEADS</span>
            <span style={{ fontSize: 10, color: "#4a5568", letterSpacing: "0.1em" }}>MA MULTIFAMILY PROSPECTOR</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={() => setShowAdd(true)} style={{ background: "#d4a843", color: "#060b14", padding: "7px 14px", borderRadius: 4 }}>+ ADD LEAD</button>
            <label className="btn" style={{ background: "#10b981", color: "#fff", padding: "7px 14px", borderRadius: 4, cursor: "pointer" }} onClick={() => setImportMode("append")}>
              ↑ APPEND CSV
              <input type="file" accept=".csv,.dbf,.txt" style={{ display: "none" }} onChange={handleImportCSV} />
            </label>
            <label className="btn" style={{ background: "#1e4d3a", color: "#10b981", padding: "7px 14px", borderRadius: 4, cursor: "pointer", border: "1px solid #10b981" }} onClick={() => setImportMode("replace")}>
              ↑ REPLACE CSV
              <input type="file" accept=".csv,.dbf,.txt" style={{ display: "none" }} onChange={handleImportCSV} />
            </label>
            <button className="btn" onClick={exportCSV} style={{ background: "#1e2d45", color: "#94a3b8", padding: "7px 14px", borderRadius: 4 }}>↓ EXPORT CSV</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 0 }}>
          {["leads", "pipeline", "guide"].map(tab => (
            <button key={tab} className={`btn${activeTab === tab ? " tab-active" : ""}`}
              onClick={() => setActiveTab(tab)}
              style={{ background: "none", color: "#4a5568", padding: "10px 20px", fontSize: 10, letterSpacing: "0.12em", borderBottom: "2px solid transparent" }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Import result banner ── */}
      {importResult && (
        <div style={{ background: importResult.errors.length ? "#1a0e0e" : "#0d1f15", borderBottom: `1px solid ${importResult.errors.length ? "#ef4444" : "#10b981"}40`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, fontSize: 11 }}>
          <span style={{ color: importResult.errors.length && importResult.added === 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
            {importResult.added > 0
              ? importResult.replaced
                ? `✓ Replaced all leads — ${importResult.added} loaded`
                : `✓ Appended ${importResult.added} lead${importResult.added !== 1 ? "s" : ""}${importResult.skipped > 0 ? ` (${importResult.skipped} duplicate${importResult.skipped !== 1 ? "s" : ""} skipped)` : ""}`
              : importResult.errors[0] || "No leads imported"}
          </span>
          {importResult.errors.length > 0 && importResult.added > 0 && (
            <span style={{ color: "#f59e0b" }}>{importResult.errors.join(" · ")}</span>
          )}
          <button className="btn" onClick={() => setImportResult(null)} style={{ marginLeft: "auto", background: "none", color: "#4a5568", padding: "2px 8px", fontSize: 11 }}>✕</button>
        </div>
      )}

      {/* ── LEADS TAB ── */}
      {activeTab === "leads" && (
        <div style={{ display: "flex", height: "calc(100vh - 97px)" }}>

          {/* Sidebar */}
          <div style={{ width: 220, background: "#060b14", borderRight: "1px solid #1e2d45", padding: 16, overflowY: "auto", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.15em", marginBottom: 16 }}>FILTERS</div>

            <div style={{ marginBottom: 20 }}>
              {[
                ["TOTAL LEADS",     stats.total,     "#94a3b8"],
                ["🔥 HOT (90+)",    stats.hot,       "#10b981"],
                ["MAILED",          stats.mailed,    "#3b82f6"],
                ["FOLLOW-UP READY", stats.followUp,  "#f59e0b"],
                ["CONTACTED",       stats.contacted, "#3b82f6"],
                ["MEETINGS",        stats.meetings,  "#8b5cf6"],
                ["OFFERS",          stats.offers,    "#ef4444"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #0f1829" }}>
                  <span style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.1em" }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color }}>{val}</span>
                </div>
              ))}
            </div>

            {(hotUnmailed.length > 0 || followUpReady.length > 0) && (
              <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                {hotUnmailed.length > 0 && (
                  <button className="btn"
                    onClick={() => setCampaign({ open: true, sending: false, results: null, type: "new" })}
                    style={{ width: "100%", background: "#10b981", color: "#fff", padding: "8px 0", borderRadius: 4, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
                    {mailTargets.length < hotUnmailed.length
                      ? `SEND POSTCARDS (${mailTargets.length} selected)`
                      : `SEND POSTCARDS (${hotUnmailed.length})`}
                  </button>
                )}
                {followUpReady.length > 0 && (
                  <button className="btn"
                    onClick={() => setCampaign({ open: true, sending: false, results: null, type: "followup" })}
                    style={{ width: "100%", background: "#f59e0b", color: "#000", padding: "8px 0", borderRadius: 4, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>
                    {followUpTargets.length < followUpReady.length
                      ? `SEND FOLLOW-UP (${followUpTargets.length} selected)`
                      : `SEND FOLLOW-UP (${followUpReady.length})`}
                  </button>
                )}
                {selectedForMail.size > 0 && (
                  <button className="btn" onClick={() => setSelectedForMail(new Set())}
                    style={{ width: "100%", background: "none", color: "#4a5568", fontSize: 9, padding: "2px 0" }}>
                    clear selection
                  </button>
                )}
              </div>
            )}

            <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.15em", marginBottom: 12 }}>FILTER BY</div>

            {[
              ["SEARCH",        <input  key="search"    className="filter-input" placeholder="address, name..." value={filters.search}    onChange={e => setFilter("search",       e.target.value)} />],
              ["CITY",          <select key="city"      className="filter-input" value={filters.city}      onChange={e => setFilter("city",        e.target.value)}>{cities.map(c => <option key={c}>{c}</option>)}</select>],
              ["STATUS",        <select key="status"    className="filter-input" value={filters.status}    onChange={e => setFilter("status",      e.target.value)}>{["All", ...STATUS_OPTIONS].map(s => <option key={s}>{s}</option>)}</select>],
              ["OWNER TYPE",    <select key="ownerType" className="filter-input" value={filters.ownerType} onChange={e => setFilter("ownerType",   e.target.value)}>{ownerTypes.map(t => <option key={t}>{t}</option>)}</select>],
              ["MIN UNITS",     <input  key="minUnits"  className="filter-input" type="number" min="0" value={filters.minUnits}    onChange={e => setFilter("minUnits",    +e.target.value)} />],
              ["MAX UNITS",     <input  key="maxUnits"  className="filter-input" type="number" min="0" value={filters.maxUnits === 9999 ? "" : filters.maxUnits} placeholder="no limit" onChange={e => setFilter("maxUnits", e.target.value === "" ? 9999 : +e.target.value)} />],
              ["MIN EQUITY %",  <input  key="minEq"     className="filter-input" type="number" value={filters.minEquity}   onChange={e => setFilter("minEquity",   +e.target.value)} />],
              ["MIN YRS OWNED", <input  key="minYrs"    className="filter-input" type="number" value={filters.minYearsOwned} onChange={e => setFilter("minYearsOwned", +e.target.value)} />],
            ].map(([label, el]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                {el}
              </div>
            ))}

            <button className="btn" onClick={() => setFilters(DEFAULT_FILTERS)}
              style={{ background: "#1e2d45", color: "#64748b", padding: "6px 12px", borderRadius: 4, width: "100%", marginTop: 8 }}>
              RESET FILTERS
            </button>

            <div style={{ marginTop: 20, padding: 12, background: "#0d1525", borderRadius: 4, border: "1px solid #1e2d45" }}>
              <div style={{ fontSize: 9, color: "#d4a843", letterSpacing: "0.1em", marginBottom: 6 }}>SCORE KEY</div>
              {[["🔥 HOT", "90–99", "#10b981"], ["⚡ WARM", "75–89", "#f59e0b"], ["❄ COLD", "<75", "#64748b"]].map(([l, r, c]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: c }}>{l}</span>
                  <span style={{ fontSize: 9, color: "#4a5568" }}>{r}</span>
                </div>
              ))}
              <div style={{ fontSize: 8, color: "#374151", marginTop: 6, lineHeight: 1.4 }}>Score: 40pts years held + 40pts equity + 10pts non-LLC + 10pts absentee</div>
            </div>

            <div style={{ marginTop: 12, padding: 12, background: "#0d1525", borderRadius: 4, border: "1px solid #1e2d45" }}>
              <div style={{ fontSize: 9, color: "#d4a843", letterSpacing: "0.1em", marginBottom: 6 }}>MA USE CODES</div>
              {[
                ["1040","2-family"],
                ["1050","3-family"],
                ["1110","4–8 units"],
                ["1120","4–8 units"],
                ["3200","Apt 10+"],
                ["3210","Apt 10+"],
              ].map(([code, label]) => (
                <div key={code} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: "#60a5fa", fontWeight: 600 }}>{code}</span>
                  <span style={{ fontSize: 9, color: "#4a5568" }}>{label}</span>
                </div>
              ))}
              <div style={{ fontSize: 8, color: "#374151", marginTop: 6, lineHeight: 1.4 }}>Type codes above into USE CODES filter (comma-separated)</div>
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#060b14", position: "sticky", top: 0, zIndex: 10 }}>
                  <th style={{ padding: "10px 8px 10px 14px", borderBottom: "1px solid #1e2d45" }}>
                    <input type="checkbox"
                      title="Select all eligible (HOT unmailed + follow-up ready)"
                      checked={eligibleForSelect.length > 0 && eligibleForSelect.every(l => selectedForMail.has(l.id))}
                      ref={el => { if (el) el.indeterminate = selectedForMail.size > 0 && !eligibleForSelect.every(l => selectedForMail.has(l.id)); }}
                      onChange={toggleSelectAll}
                      style={{ accentColor: "#10b981", cursor: "pointer" }} />
                  </th>
                  {[
                    ["score",     "SCORE"],
                    ["address",   "ADDRESS"],
                    ["city",      "CITY"],
                    ["units",     "UNITS"],
                    ["lastSale",  "YR SOLD"],
                    ["equity",    "EQUITY"],
                    ["assessed",  "ASSESSED"],
                    ["ownerName", "OWNER"],
                    ["ownerType", "TYPE"],
                    ["useCode",   "USE CODE"],
                    ["status",    "STATUS"],
                  ].map(([f, label]) => (
                    <th key={f} onClick={() => handleSort(f)}
                      style={{ padding: "10px 12px", textAlign: "left", fontSize: 9, letterSpacing: "0.12em", color: sort.field === f ? "#d4a843" : "#4a5568", borderBottom: "1px solid #1e2d45", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                      {label}<SortIcon field={f} sort={sort} />
                    </th>
                  ))}
                  <th style={{ padding: "10px 12px", fontSize: 9, letterSpacing: "0.12em", color: "#4a5568", borderBottom: "1px solid #1e2d45", whiteSpace: "nowrap" }}>MAIL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr key={lead.id} className="row-hover" onClick={() => setSelected(lead)}
                    style={{ background: i % 2 === 0 ? "#0a0e1a" : "#08111e", borderBottom: "1px solid #0f1829" }}>
                    <td style={{ padding: "10px 8px 10px 14px" }} onClick={e => e.stopPropagation()}>
                      {(lead.score >= 90 && !currentRound(lead)) || followUpReady.some(f => f.id === lead.id)
                        ? <input type="checkbox"
                            checked={selectedForMail.has(lead.id)}
                            onChange={() => toggleMailSelect(lead.id)}
                            style={{ accentColor: followUpReady.some(f => f.id === lead.id) ? "#f59e0b" : "#10b981", cursor: "pointer" }} />
                        : <span style={{ display: "inline-block", width: 13 }} />}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(lead.score) }}>{lead.score}</span>
                        <span style={{ fontSize: 9, color: scoreColor(lead.score) }}>{scoreLabel(lead.score)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#cbd5e1", fontWeight: 500 }}>{lead.address}</td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{lead.city}</td>
                    <td style={{ padding: "10px 12px", color: "#d4a843", fontWeight: 600, textAlign: "center" }}>{lead.units}</td>
                    <td style={{ padding: "10px 12px", color: CURRENT_YEAR - lead.lastSale >= 20 ? "#10b981" : "#94a3b8" }}>
                      {lead.lastSale} <span style={{ fontSize: 9, color: "#4a5568" }}>({CURRENT_YEAR - lead.lastSale}y)</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 36, height: 4, background: "#1e2d45", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${lead.equity}%`, height: "100%", background: lead.equity >= 80 ? "#10b981" : "#f59e0b" }} />
                        </div>
                        <span style={{ fontSize: 10, color: lead.equity >= 80 ? "#10b981" : "#f59e0b" }}>{lead.equity}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#94a3b8" }}>${(lead.assessed / 1000).toFixed(0)}k</td>
                    <td style={{ padding: "10px 12px", color: "#cbd5e1", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.ownerName}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 9, background: (OWNER_TYPE_STYLES[lead.ownerType] ?? OWNER_TYPE_STYLES.Individual).bg, color: (OWNER_TYPE_STYLES[lead.ownerType] ?? OWNER_TYPE_STYLES.Individual).color, padding: "2px 7px", borderRadius: 3 }}>
                        {lead.ownerType}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#4a5568", fontSize: 10 }}>{lead.useCode || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <select value={lead.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); updateLead(lead.id, "status", e.target.value); }}
                        style={{ background: "#0a0e1a", border: `1px solid ${STATUS_COLORS[lead.status]}40`, color: STATUS_COLORS[lead.status], padding: "3px 7px", borderRadius: 3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {(() => {
                        const r   = currentRound(lead);
                        const d   = daysSinceMailed(lead);
                        if (!r) return <span style={{ color: "#1e2d45", fontSize: 10 }}>—</span>;
                        const ready = followUpReady.some(f => f.id === lead.id);
                        return (
                          <span style={{ fontSize: 10, fontWeight: 600, color: ready ? "#f59e0b" : "#3b82f6" }}>
                            R{r} · {d}d{ready ? " ↻" : ""}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#4a5568", fontSize: 12 }}>
                {leads.length === 0 ? "No leads loaded — import a CSV to get started" : "No leads match current filters"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PIPELINE TAB ── */}
      {activeTab === "pipeline" && (
        <div style={{ padding: 24, overflowY: "auto", height: "calc(100vh - 97px)" }}>
          <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 18, color: "#d4a843", marginBottom: 20 }}>Pipeline Overview</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
            {STATUS_OPTIONS.map(status => {
              const count = leads.filter(l => l.status === status).length;
              return (
                <div key={status} style={{ background: "#060b14", border: `1px solid ${STATUS_COLORS[status]}30`, borderTop: `3px solid ${STATUS_COLORS[status]}`, borderRadius: 6, padding: 16 }}>
                  <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.12em", marginBottom: 8 }}>{status.toUpperCase()}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_COLORS[status] }}>{count}</div>
                  <div style={{ fontSize: 9, color: "#374151", marginTop: 4 }}>{count === 1 ? "lead" : "leads"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 14, color: "#94a3b8", marginBottom: 16 }}>By City</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Array.from(new Set(leads.map(l => l.city))).sort().map(city => {
              const cityLeads = leads.filter(l => l.city === city);
              const hot       = cityLeads.filter(l => l.score >= 90).length;
              const avgScore  = Math.round(cityLeads.reduce((a, l) => a + l.score, 0) / cityLeads.length);
              return (
                <div key={city} style={{ background: "#060b14", border: "1px solid #1e2d45", borderRadius: 6, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, marginBottom: 8 }}>{city}</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><div style={{ fontSize: 9, color: "#4a5568" }}>TOTAL</div><div style={{ fontSize: 20, color: "#94a3b8", fontWeight: 600 }}>{cityLeads.length}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4a5568" }}>HOT</div><div style={{ fontSize: 20, color: "#10b981", fontWeight: 600 }}>{hot}</div></div>
                    <div><div style={{ fontSize: 9, color: "#4a5568" }}>AVG SCORE</div><div style={{ fontSize: 20, color: "#d4a843", fontWeight: 600 }}>{avgScore}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GUIDE TAB ── */}
      {activeTab === "guide" && (
        <div style={{ padding: 24, overflowY: "auto", height: "calc(100vh - 97px)", maxWidth: 800 }}>
          <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, color: "#d4a843", marginBottom: 8 }}>Automation Guide</div>
          <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 28 }}>How to feed real Massachusetts data into this dashboard</div>

          {[
            {
              step: "01", title: "Download MassGIS Parcel Data (Free)", color: "#10b981",
              content: `MassGIS publishes the Level 3 Assessors' Parcels statewide dataset — every parcel in MA with owner, use code, unit count, sale date, assessed value, and lot size. This is the most powerful free data source available.

URL: mass.gov/info-details/massgis-data-property-tax-parcels

STEPS:
1. Go to the MassGIS data portal
2. Search "Level 3 Assessors Parcels"
3. Download the GIS shapefile or CSV for your target municipalities (Worcester, Springfield, Lowell, etc.)
4. Open in Excel or Google Sheets
5. Filter by USE_CODE: 111 (triple decker), 112 (4–8 units), 320 (10+ units)
6. Filter LAST_SALE_DATE older than 2014
7. Export filtered list → Import to this dashboard via CSV`,
            },
            {
              step: "02", title: "Python Script: Automated Lead Scorer", color: "#3b82f6",
              content: `Run this Python script weekly to generate a fresh scored lead list.
Save as ma_leads.py and run: python ma_leads.py

pip install pandas geopandas requests

import pandas as pd

# Load MassGIS data (downloaded CSV)
df = pd.read_csv('massgis_parcels.csv')

# Filter multifamily 10+ units
mf = df[df['USE_CODE'].isin(['320', '340', '111', '112'])]
mf = mf[mf['NUM_UNITS'] >= 10]

# Score each lead
def score_lead(row):
    score = 0
    years_held = 2026 - row['SALE_YEAR']
    score += min(40, years_held * 2)    # up to 40 pts
    equity_est = (row['TOTAL_VAL'] - row['MORT_AMT']) / row['TOTAL_VAL'] * 100
    score += min(40, equity_est * 0.4)  # up to 40 pts
    if 'LLC' not in str(row['OWNER1']): score += 10
    if row['OWNER_ADDR'] != row['SITE_ADDR']: score += 10  # absentee
    return min(99, round(score))

mf['score'] = mf.apply(score_lead, axis=1)
mf_sorted = mf.sort_values('score', ascending=False)

# Export top 50 leads per city
for city in ['Worcester','Springfield','Lowell','Brockton','Lynn']:
    city_df = mf_sorted[mf_sorted['CITY'] == city.upper()].head(50)
    city_df.to_csv(f'leads_{city.lower()}.csv', index=False)

print(f"Generated {len(mf_sorted)} leads total")`,
            },
            {
              step: "03", title: "Mass Land Records: Ownership Search", color: "#8b5cf6",
              content: `masslandrecords.com — Free public deed search. Use this to:

1. VERIFY OWNERSHIP: Search by address to confirm current owner and LLC principals
2. FIND FREE-AND-CLEAR PROPERTIES: No mortgage = maximum seller flexibility
3. IDENTIFY ESTATE SITUATIONS: Look for estates as grantees — these are motivated sellers
4. TRACK RECENT TRANSFERS: Set up searches for your target cities

WORKFLOW:
→ Get a lead from MassGIS
→ Search masslandrecords.com for the parcel
→ If mortgage balance shows as paid off or very old: HIGH PRIORITY
→ If estate or trust transferred recently: HIGH PRIORITY
→ Add notes to this dashboard accordingly

PRO TIP: Properties where the deed transferred via "Estate of [Name]"
are almost always motivated — heirs rarely want to manage apartments.`,
            },
            {
              step: "04", title: "Direct Mail Automation", color: "#f59e0b",
              content: `Once you have your lead list, automate outreach with these tools:

HANDWRITTEN LETTERS (highest response rate ~3–5%):
→ Handwrytten.com — API-connected handwritten letters, ~$3–4/letter
→ IgnitePosts.com — similar, integrates with spreadsheets
→ PostcardMania.com — lower cost postcards, ~$0.50/piece

YOUR LETTER TEMPLATE:
"Dear [Owner Name],

My name is [Your Name] and I am a local real estate investor
actively looking to purchase apartment buildings in [City].

I came across your property at [Address] and wanted to reach
out directly — I am interested in making a cash offer and can
close on your timeline with no broker fees.

If you have any interest in discussing, please call me at
[Phone] or email [Email]. There is no obligation whatsoever.

Respectfully, [Your Name]"

CADENCE:
Week 1: First letter
Week 4: Follow-up postcard
Week 12: Second letter if no response
Track all in this dashboard.`,
            },
            {
              step: "05", title: "Google Sheets Automation (No-Code Option)", color: "#ef4444",
              content: `If Python feels too technical, use this no-code approach:

1. Download MassGIS CSV → Open in Google Sheets
2. Add formula columns:
   =IF(2026-D2>=15,"HOT","WARM")  [years owned]
   =IF(E2/F2>0.8,"HIGH EQUITY","")  [equity check]
   =(F2-G2)/F2*100  [equity percentage]

3. Use Zapier to automate:
   New row in sheet → Send email alert to yourself
   New row → Create task in Notion/Trello
   New row → Add to Mailchimp for drip campaign

4. Connect to this dashboard:
   Export filtered Google Sheet as CSV
   Import here using the + ADD LEAD button (one at a time)
   or paste data in bulk via the CSV import

FREE TOOLS USED:
→ Google Sheets (free)
→ Zapier free tier (100 tasks/month)
→ MassGIS data (free)
→ masslandrecords.com (free)
Total cost: $0/month to start`,
            },
          ].map(({ step, title, color, content }) => (
            <div key={step} style={{ background: "#060b14", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 9, color, letterSpacing: "0.15em", fontWeight: 700 }}>STEP {step}</span>
                <span style={{ fontSize: 13, color: "#e2e8f0", fontFamily: "'Libre Baskerville', serif" }}>{title}</span>
              </div>
              <pre style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "pre-wrap", lineHeight: 1.7, margin: 0, fontFamily: "inherit" }}>{content}</pre>
            </div>
          ))}
        </div>
      )}

      {/* ── Lead Detail Modal ── */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#060b14", border: "1px solid #1e2d45", borderRadius: 8, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2d45", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: "#e2e8f0" }}>{selected.address}</div>
                <div style={{ fontSize: 10, color: "#4a5568", marginTop: 2 }}>{selected.city}, MA · {selected.units} units · Built {selected.yearBuilt}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(selected.score) }}>{selected.score}</div>
                  <div style={{ fontSize: 9, color: scoreColor(selected.score) }}>{scoreLabel(selected.score)}</div>
                </div>
                <button className="btn" onClick={() => setSelected(null)} style={{ background: "#1e2d45", color: "#64748b", padding: "6px 10px", borderRadius: 4 }}>✕</button>
              </div>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  ["OWNER",         selected.ownerName],
                  ["TYPE",          selected.ownerType],
                  ["OWNER ADDRESS", selected.ownerAddress],
                  ["PHONE",         selected.phone || "—"],
                  ["LAST SOLD",     `${selected.lastSale} (${CURRENT_YEAR - selected.lastSale} yrs ago)`],
                  ["LAST PRICE",    `$${selected.lastPrice.toLocaleString()}`],
                  ["ASSESSED VALUE",`$${selected.assessed.toLocaleString()}`],
                  ["EQUITY EST.",   `${selected.equity}%`],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "#0a0e1a", padding: "10px 12px", borderRadius: 4 }}>
                    <div style={{ fontSize: 8, color: "#4a5568", letterSpacing: "0.12em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#e2e8f0" }}>{val}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.12em", marginBottom: 6 }}>OUTREACH STATUS</div>
                <select value={selected.status} onChange={e => updateLead(selected.id, "status", e.target.value)}
                  style={{ background: "#0a0e1a", border: `1px solid ${STATUS_COLORS[selected.status]}`, color: STATUS_COLORS[selected.status], padding: "8px 12px", borderRadius: 4, fontSize: 11, width: "100%", cursor: "pointer", fontFamily: "inherit" }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.12em", marginBottom: 6 }}>PHONE</div>
                <input className="filter-input" value={selected.phone} onChange={e => updateLead(selected.id, "phone", e.target.value)} placeholder="Add phone number..." style={{ width: "100%" }} />
              </div>

              <div>
                <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.12em", marginBottom: 6 }}>NOTES</div>
                <textarea className="filter-input" value={selected.notes} onChange={e => updateLead(selected.id, "notes", e.target.value)}
                  placeholder="Conversation notes, follow-up reminders..." rows={4} style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
                <a href={`https://www.google.com/maps/search/${encodeURIComponent(selected.address + " " + selected.city + " MA")}`}
                  target="_blank" rel="noreferrer"
                  style={{ background: "#1e2d45", color: "#94a3b8", padding: "8px 12px", borderRadius: 4, fontSize: 10, textAlign: "center", textDecoration: "none", display: "block", letterSpacing: "0.08em" }}>
                  🗺 VIEW ON MAP
                </a>
                <a href="https://www.masslandrecords.com/" target="_blank" rel="noreferrer"
                  style={{ background: "#1e2d45", color: "#94a3b8", padding: "8px 12px", borderRadius: 4, fontSize: 10, textAlign: "center", textDecoration: "none", display: "block", letterSpacing: "0.08em" }}>
                  📋 DEED SEARCH
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Postcards Modal ── */}
      {campaign.open && (
        <div className="modal-overlay" onClick={() => !campaign.sending && setCampaign(c => ({ ...c, open: false }))}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#060b14", border: "1px solid #1e2d45", borderRadius: 8, width: "100%", maxWidth: 520, padding: 28, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: "#d4a843", marginBottom: 6 }}>{campaignTitle}</div>
            <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 20 }}>{campaignSubtitle}</div>

            {campaign.results ? (
              <div>
                {campaign.results.map((r, i) => {
                  const lead = leads.find(l => l.id === r.id);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #0f1829", fontSize: 11 }}>
                      <span style={{ color: "#94a3b8" }}>{lead ? `${lead.address}, ${lead.city}` : `Lead #${r.id}`}</span>
                      {r.status === "sent"    && <span style={{ color: campaignAccent, fontWeight: 600 }}>✓ Mailed{r.expectedDelivery ? ` · est. ${r.expectedDelivery}` : ""}</span>}
                      {r.status === "skipped" && <span style={{ color: "#f59e0b" }}>⚠ Skipped — {r.reason}</span>}
                      {r.status === "failed"  && <span style={{ color: "#ef4444" }}>✕ Failed — {r.reason}</span>}
                    </div>
                  );
                })}
                <button className="btn" onClick={() => setCampaign({ open: false, sending: false, results: null, type: "new" })}
                  style={{ marginTop: 20, width: "100%", background: "#1e2d45", color: "#94a3b8", padding: "8px 0", borderRadius: 4, fontSize: 11 }}>
                  Close
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>
                  {campaignTargets.length} postcard{campaignTargets.length !== 1 ? "s" : ""}
                  {selectedForMail.size > 0 ? " (selected)" : campaignIsFollowUp ? ` (all ${FOLLOWUP_DAYS}d+ unmailed)` : " (all HOT unmailed)"}
                  {" "}· est. ${(campaignTargets.length * 0.85).toFixed(2)} via Lob
                </div>
                {campaignTargets.map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #0f1829", fontSize: 11 }}>
                    <span style={{ color: "#94a3b8" }}>{l.address}, {l.city}</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: "#4a5568" }}>{l.ownerName}</span>
                      {campaignIsFollowUp && <span style={{ color: "#f59e0b", fontSize: 9, marginLeft: 8 }}>R{currentRound(l)} · {daysSinceMailed(l)}d ago</span>}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button className="btn" onClick={() => setCampaign(c => ({ ...c, open: false }))}
                    style={{ flex: 1, background: "#1e2d45", color: "#64748b", padding: "8px 0", borderRadius: 4, fontSize: 11 }}>
                    Cancel
                  </button>
                  <button className="btn" onClick={() => sendPostcards(campaign.type)} disabled={campaign.sending}
                    style={{ flex: 2, background: campaign.sending ? campaignAccentDark : campaignAccent, color: campaignIsFollowUp ? "#000" : "#fff", padding: "8px 0", borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
                    {campaign.sending ? "Sending…" : `Confirm — Send ${campaignTargets.length} Postcard${campaignTargets.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Lead Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#060b14", border: "1px solid #1e2d45", borderRadius: 8, width: "100%", maxWidth: 480, padding: 24 }}>
            <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: "#d4a843", marginBottom: 20 }}>Add New Lead</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["Address *",      "address",      "text",    "47 Pleasant St"],
                ["City *",         "city",         "citysel", null],
                ["Units *",        "units",        "number",  "14"],
                ["Year Last Sold", "lastSale",     "number",  "2005"],
                ["Last Sale Price","lastPrice",    "number",  "450000"],
                ["Assessed Value", "assessed",     "number",  "1200000"],
                ["Owner Name",     "ownerName",    "text",    "Smith Family LLC"],
                ["Owner Address",  "ownerAddress", "text",    "22 Oak St..."],
                ["Owner Type",     "ownerType",    "typesel", null],
                ["Phone",          "phone",        "text",    "508-555-0100"],
              ].map(([label, field, type, ph]) => (
                <div key={field} style={{ gridColumn: ["address", "ownerAddress"].includes(field) ? "1/-1" : "auto" }}>
                  <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                  {type === "citysel" ? (
                    <select className="filter-input" value={newLead.city} onChange={e => setNewLead(p => ({ ...p, city: e.target.value }))}>
                      {["Worcester","Springfield","Lowell","Brockton","Lynn","New Bedford","Fall River","Lawrence","Quincy","Fitchburg"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  ) : type === "typesel" ? (
                    <select className="filter-input" value={newLead.ownerType} onChange={e => setNewLead(p => ({ ...p, ownerType: e.target.value }))}>
                      {["Individual","LLC","Trust","Estate"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  ) : (
                    <input className="filter-input" type={type} placeholder={ph} value={newLead[field]}
                      onChange={e => setNewLead(p => ({ ...p, [field]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: "0.1em", marginBottom: 4 }}>NOTES</div>
              <textarea className="filter-input" value={newLead.notes} onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))}
                rows={2} style={{ width: "100%", resize: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn" onClick={addLead}
                style={{ flex: 1, background: "#d4a843", color: "#060b14", padding: 10, borderRadius: 4, fontWeight: 600 }}>
                ADD LEAD
              </button>
              <button className="btn" onClick={() => setShowAdd(false)}
                style={{ background: "#1e2d45", color: "#64748b", padding: "10px 16px", borderRadius: 4 }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
