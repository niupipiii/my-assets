import React, { useState, useEffect, useCallback } from "react";

// ─── Categories with default sub-accounts ───
const ASSET_CATEGORIES = [
  { key: "cash", label: "现金/存款", color: "#2dd4bf", icon: "💵", defaults: ["余额宝", "微信零钱", "银行卡"] },
  { key: "stock", label: "股票", color: "#818cf8", icon: "📈", defaults: ["A股", "港股", "美股"] },
  { key: "fund", label: "基金", color: "#6366f1", icon: "📊", defaults: ["指数基金", "混合基金"] },
  { key: "bond", label: "债券/理财", color: "#fb923c", icon: "💰", defaults: ["银行理财", "国债"] },
  { key: "property", label: "房产", color: "#f472b6", icon: "🏠", defaults: ["自住房产"] },
  { key: "insurance", label: "保险", color: "#a78bfa", icon: "🛡️", defaults: ["年金险", "增额寿"] },
  { key: "crypto", label: "数字货币", color: "#fbbf24", icon: "₿", defaults: ["BTC", "ETH"] },
  { key: "other", label: "其他", color: "#94a3b8", icon: "📦", defaults: ["其他"] },
];

const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

const formatMoney = (v) => {
  if (v >= 1_0000_0000) return (v / 1_0000_0000).toFixed(2) + "亿";
  if (v >= 10000) return (v / 10000).toFixed(2) + "万";
  return v.toLocaleString("zh-CN");
};
const formatMoneyShort = (v) => {
  if (v >= 1_0000_0000) return (v / 1_0000_0000).toFixed(1) + "亿";
  if (v >= 10000) return (v / 10000).toFixed(1) + "万";
  return v.toLocaleString("zh-CN");
};

const catTotal = (assets, catKey) => {
  const subs = assets?.[catKey];
  if (!subs || typeof subs !== "object") return typeof subs === "number" ? subs : 0;
  return Object.values(subs).reduce((s, v) => s + (Number(v) || 0), 0);
};
const grandTotal = (assets) => ASSET_CATEGORIES.reduce((s, c) => s + catTotal(assets, c.key), 0);

// ─── localStorage helpers ───
function loadData() {
  try { const d = localStorage.getItem("asset-records"); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveData(records) {
  try { localStorage.setItem("asset-records", JSON.stringify(records)); } catch (e) { console.error(e); }
}
function loadConfig() {
  try { const d = localStorage.getItem("asset-config"); return d ? JSON.parse(d) : null; } catch { return null; }
}
function saveConfig(cfg) {
  try { localStorage.setItem("asset-config", JSON.stringify(cfg)); } catch (e) { console.error(e); }
}

// ─── Sparkline ───
function Sparkline({ data, color, width = 200, height = 60 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - 6 - ((v - min) / range) * (height - 12),
  }));
  const gradId = `sg-${color.replace("#", "")}`;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === data.length - 1 ? 4 : 2.5} fill={i === data.length - 1 ? color : "white"} stroke={color} strokeWidth="2" />
      ))}
    </svg>
  );
}

// ─── Donut ───
function DonutChart({ slices, size = 140 }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return null;
  const r = size / 2 - 8, cx = size / 2, cy = size / 2;
  let cum = -Math.PI / 2;
  const paths = slices.filter(s => s.value > 0).map((sl) => {
    const frac = sl.value / total, start = cum;
    cum += frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(cum - 0.001), y2 = cy + r * Math.sin(cum - 0.001);
    return <path key={sl.key} d={`M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={sl.color} stroke="white" strokeWidth="2" />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b" fontFamily="inherit">{formatMoneyShort(total)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="inherit">总资产</text>
    </svg>
  );
}

// ─── Stacked Bar ───
function TrendBarChart({ records, width = 440, height = 180 }) {
  if (!records || records.length === 0) return null;
  const totals = records.map(r => grandTotal(r.assets));
  const max = Math.max(...totals) || 1;
  const barW = Math.min(36, (width - 40) / records.length - 8);
  const chartH = height - 36;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = 8 + chartH * (1 - f);
        return (
          <g key={f}>
            <line x1="40" y1={y} x2={width} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x="36" y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="inherit">{formatMoneyShort(max * f)}</text>
          </g>
        );
      })}
      {records.map((rec, i) => {
        const x = 50 + i * ((width - 60) / records.length) + ((width - 60) / records.length - barW) / 2;
        let cy = 8 + chartH;
        const segs = ASSET_CATEGORIES.map(cat => {
          const val = catTotal(rec.assets, cat.key);
          const h = (val / max) * chartH;
          const seg = { key: cat.key, color: cat.color, x, y: cy - h, h, val };
          cy -= h;
          return seg;
        }).filter(s => s.val > 0);
        const label = `${rec.year}-${String(rec.month).padStart(2, "0")}`;
        return (
          <g key={i}>
            {segs.map(sg => <rect key={sg.key} x={sg.x} y={sg.y} width={barW} height={Math.max(sg.h, 0.5)} rx="2" fill={sg.color} />)}
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="inherit">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main ───
export default function App() {
  const [records, setRecords] = useState(() => loadData());
  const [subAccounts, setSubAccounts] = useState(() => {
    const cfg = loadConfig();
    if (cfg?.subAccounts) return cfg.subAccounts;
    const defaults = {};
    ASSET_CATEGORIES.forEach(c => { defaults[c.key] = [...c.defaults]; });
    return defaults;
  });
  const [view, setView] = useState("dashboard");
  const [editIdx, setEditIdx] = useState(null);

  const now = new Date();
  const [formYear, setFormYear] = useState(now.getFullYear());
  const [formMonth, setFormMonth] = useState(now.getMonth() + 1);
  const [formAssets, setFormAssets] = useState({});
  const [showConfirm, setShowConfirm] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});
  const [newSubName, setNewSubName] = useState({});

  useEffect(() => { saveData(records); }, [records]);
  useEffect(() => { saveConfig({ subAccounts }); }, [subAccounts]);

  const getSubsForCat = (catKey) => subAccounts[catKey] || [];
  const toggleCat = (catKey) => setExpandedCats(p => ({ ...p, [catKey]: !p[catKey] }));

  const addSubAccount = (catKey) => {
    const name = (newSubName[catKey] || "").trim();
    if (!name) return;
    const cur = subAccounts[catKey] || [];
    if (cur.includes(name)) return;
    setSubAccounts(p => ({ ...p, [catKey]: [...cur, name] }));
    setNewSubName(p => ({ ...p, [catKey]: "" }));
  };

  const removeSubAccount = (catKey, name) => {
    setSubAccounts(p => ({ ...p, [catKey]: (p[catKey] || []).filter(n => n !== name) }));
    setFormAssets(p => {
      const cat = { ...(p[catKey] || {}) };
      delete cat[name];
      return { ...p, [catKey]: cat };
    });
  };

  const resetForm = useCallback(() => {
    setFormYear(now.getFullYear());
    setFormMonth(now.getMonth() + 1);
    setFormAssets({});
    setEditIdx(null);
    setExpandedCats({});
  }, []);

  const handleSave = useCallback(() => {
    const entry = { year: formYear, month: formMonth, assets: { ...formAssets }, ts: Date.now() };
    setRecords(prev => {
      const idx = editIdx !== null ? editIdx : prev.findIndex(r => r.year === formYear && r.month === formMonth);
      let next;
      if (idx >= 0) { next = [...prev]; next[idx] = entry; } else { next = [...prev, entry]; }
      next.sort((a, b) => a.year - b.year || a.month - b.month);
      return next;
    });
    resetForm();
    setView("dashboard");
  }, [formYear, formMonth, formAssets, editIdx, resetForm]);

  const handleEdit = useCallback((idx) => {
    const r = records[idx];
    setFormYear(r.year);
    setFormMonth(r.month);
    setFormAssets(JSON.parse(JSON.stringify(r.assets)));
    setEditIdx(idx);
    setView("add");
  }, [records]);

  const handleDelete = useCallback((idx) => {
    setRecords(prev => prev.filter((_, i) => i !== idx));
    setShowConfirm(null);
  }, []);

  const sorted = records;
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const prev2 = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const totalNow = latest ? grandTotal(latest.assets) : 0;
  const totalPrev = prev2 ? grandTotal(prev2.assets) : 0;
  const change = totalPrev ? ((totalNow - totalPrev) / totalPrev * 100).toFixed(1) : null;
  const donutSlices = latest ? ASSET_CATEGORIES.map(c => ({ key: c.key, value: catTotal(latest.assets, c.key), color: c.color })) : [];

  const s = {
    app: { fontFamily: "'Noto Sans SC', 'SF Pro Display', -apple-system, sans-serif", background: "linear-gradient(160deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)", minHeight: "100vh", color: "#1e293b", maxWidth: 480, margin: "0 auto", paddingBottom: 90 },
    header: { padding: "24px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg, #1e293b 0%, #475569 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
    card: { background: "white", borderRadius: 20, padding: "20px", margin: "0 16px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.04)" },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 },
    nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-around", padding: "10px 0 22px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(0,0,0,0.06)", zIndex: 100 },
    navBtn: (a) => ({ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", padding: "4px 16px", cursor: "pointer", fontSize: 10, fontWeight: a ? 700 : 500, color: a ? "#818cf8" : "#94a3b8" }),
    navIcon: { fontSize: 22 },
    input: { width: "100%", padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 12, fontSize: 16, outline: "none", fontFamily: "inherit", background: "#f8fafc", boxSizing: "border-box" },
    btn: (p) => ({ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: p ? "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)" : "#f1f5f9", color: p ? "white" : "#64748b", boxShadow: p ? "0 4px 14px rgba(99,102,241,0.3)" : "none" }),
    tag: (color) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: color + "18", color }),
  };

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div style={s.title}>资产全景</div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
          {now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, "0")}.{String(now.getDate()).padStart(2, "0")}
        </div>
      </div>

      {/* ─── Dashboard ─── */}
      {view === "dashboard" && (
        <>
          {records.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 6 }}>还没有记录</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>点击下方「记录」开始录入你的第一笔资产</div>
            </div>
          ) : (
            <>
              {/* Total */}
              <div style={{ ...s.card, background: "linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a78bfa 100%)", color: "white", border: "none" }}>
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 600, marginBottom: 8 }}>总资产</div>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1px", marginBottom: 6 }}>¥{formatMoney(totalNow)}</div>
                {change !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.2)" }}>
                      {Number(change) >= 0 ? "↑" : "↓"} {Math.abs(Number(change))}%
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>较上月</span>
                  </div>
                )}
              </div>

              {/* Donut + legend */}
              <div style={s.card}>
                <div style={s.sectionTitle}>资产配置</div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <DonutChart slices={donutSlices} size={140} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    {ASSET_CATEGORIES.filter(c => catTotal(latest?.assets, c.key) > 0).map(c => {
                      const val = catTotal(latest.assets, c.key);
                      const pct = totalNow ? (val / totalNow * 100).toFixed(1) : 0;
                      return (
                        <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={s.tag(c.color)}>{c.icon} {c.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Total trend line */}
              {sorted.length >= 2 && (() => {
                const totals = sorted.map(r => grandTotal(r.assets));
                const labels = sorted.map(r => `${r.year}.${String(r.month).padStart(2, "0")}`);
                const maxT = Math.max(...totals), minT = Math.min(...totals), rangeT = maxT - minT || 1;
                const cW = 400, cH = 160, pL = 50, pR = 10, pT = 10, pB = 28;
                const iW = cW - pL - pR, iH = cH - pT - pB;
                const pts = totals.map((v, i) => ({ x: pL + (i / (totals.length - 1)) * iW, y: pT + iH - ((v - minT) / rangeT) * iH, v }));
                const lp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                const ap = `${lp} L${pts[pts.length - 1].x},${pT + iH} L${pts[0].x},${pT + iH} Z`;
                return (
                  <div style={s.card}>
                    <div style={s.sectionTitle}>总资产趋势</div>
                    <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{ display: "block" }}>
                      <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" /></linearGradient></defs>
                      {[0, 0.25, 0.5, 0.75, 1].map(f => { const y = pT + iH * (1 - f); return (<g key={f}><line x1={pL} y1={y} x2={cW - pR} y2={y} stroke="#f1f5f9" strokeWidth="1" /><text x={pL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8" fontFamily="inherit">{formatMoneyShort(minT + rangeT * f)}</text></g>); })}
                      <path d={ap} fill="url(#tg)" />
                      <path d={lp} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {pts.map((p, i) => (<g key={i}><circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3} fill={i === pts.length - 1 ? "#6366f1" : "white"} stroke="#6366f1" strokeWidth="2" />{(pts.length <= 6 || i === 0 || i === pts.length - 1) && (<text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="8" fontWeight="700" fill="#6366f1" fontFamily="inherit">¥{formatMoneyShort(p.v)}</text>)}</g>))}
                      {pts.map((p, i) => <text key={`l${i}`} x={p.x} y={cH - 4} textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="inherit">{labels[i]}</text>)}
                    </svg>
                  </div>
                );
              })()}

              {/* Stacked bar */}
              {sorted.length >= 2 && (
                <div style={s.card}>
                  <div style={s.sectionTitle}>分类构成趋势</div>
                  <TrendBarChart records={sorted} width={440} height={180} />
                </div>
              )}

              {/* Category sparklines */}
              {sorted.length >= 2 && (
                <div style={s.card}>
                  <div style={s.sectionTitle}>分类趋势</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {ASSET_CATEGORIES.filter(c => sorted.some(r => catTotal(r.assets, c.key) > 0)).map(c => {
                      const data = sorted.map(r => catTotal(r.assets, c.key));
                      const cur = data[data.length - 1], prv = data.length > 1 ? data[data.length - 2] : cur;
                      const chg = prv ? ((cur - prv) / prv * 100).toFixed(1) : 0;
                      return (
                        <div key={c.key} style={{ padding: 10, borderRadius: 14, background: "#f8fafc" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{c.icon} {c.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: Number(chg) >= 0 ? "#10b981" : "#ef4444" }}>{Number(chg) >= 0 ? "+" : ""}{chg}%</span>
                          </div>
                          <Sparkline data={data} color={c.color} width={160} height={40} />
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>¥{formatMoneyShort(cur)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sub-account detail */}
              <div style={s.card}>
                <div style={s.sectionTitle}>账户明细（最新）</div>
                {ASSET_CATEGORIES.filter(c => catTotal(latest?.assets, c.key) > 0).map(c => {
                  const subs = latest.assets[c.key];
                  const entries = typeof subs === "object" ? Object.entries(subs).filter(([, v]) => v > 0) : [];
                  if (entries.length === 0) return null;
                  return (
                    <div key={c.key} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>{c.icon} {c.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>¥{formatMoneyShort(catTotal(latest.assets, c.key))}</span>
                      </div>
                      {entries.map(([name, val]) => (
                        <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0 5px 18px", borderLeft: `2px solid ${c.color}20` }}>
                          <span style={{ fontSize: 12, color: "#64748b" }}>{name}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>¥{formatMoneyShort(val)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Add / Edit ─── */}
      {view === "add" && (
        <>
          <div style={s.card}>
            <div style={s.sectionTitle}>{editIdx !== null ? "编辑记录" : "新增记录"}</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, display: "block" }}>年份</label>
                <select value={formYear} onChange={e => setFormYear(Number(e.target.value))} style={{ ...s.input, padding: "10px 12px" }}>
                  {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 5 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, display: "block" }}>月份</label>
                <select value={formMonth} onChange={e => setFormMonth(Number(e.target.value))} style={{ ...s.input, padding: "10px 12px" }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ASSET_CATEGORIES.map(c => {
                const subs = getSubsForCat(c.key);
                const expanded = expandedCats[c.key];
                const total = catTotal(formAssets, c.key);
                return (
                  <div key={c.key} style={{ borderRadius: 14, border: `1.5px solid ${expanded ? c.color + "40" : "#e2e8f0"}`, overflow: "hidden", transition: "border-color 0.2s" }}>
                    <button
                      onClick={() => toggleCat(c.key)}
                      style={{ width: "100%", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? c.color + "08" : "#fafbfc", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: c.color, display: "inline-block" }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{c.icon} {c.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {total > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>¥{formatMoneyShort(total)}</span>}
                        <span style={{ fontSize: 12, color: "#94a3b8", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                      </div>
                    </button>
                    {expanded && (
                      <div style={{ padding: "8px 14px 14px" }}>
                        {subs.map(name => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", marginBottom: 2, display: "block" }}>{name}</label>
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="金额（元）"
                                value={formAssets[c.key]?.[name] || ""}
                                onChange={e => {
                                  const v = Number(e.target.value) || 0;
                                  setFormAssets(p => ({ ...p, [c.key]: { ...(p[c.key] || {}), [name]: v } }));
                                }}
                                style={{ ...s.input, padding: "9px 12px", fontSize: 14 }}
                                onFocus={e => e.target.style.borderColor = c.color}
                                onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                              />
                            </div>
                            <button onClick={() => removeSubAccount(c.key, name)} style={{ marginTop: 14, padding: "8px", borderRadius: 8, border: "1px solid #fecaca", background: "white", fontSize: 12, cursor: "pointer", color: "#ef4444", lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <input
                            type="text"
                            placeholder="添加账户名称…"
                            value={newSubName[c.key] || ""}
                            onChange={e => setNewSubName(p => ({ ...p, [c.key]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && addSubAccount(c.key)}
                            style={{ ...s.input, padding: "8px 12px", fontSize: 13, flex: 1 }}
                          />
                          <button onClick={() => addSubAccount(c.key)} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${c.color}40`, background: c.color + "10", fontSize: 13, fontWeight: 600, color: c.color, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ 添加</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: "0 16px", display: "flex", gap: 10 }}>
            <button style={s.btn(false)} onClick={() => { resetForm(); setView("dashboard"); }}>取消</button>
            <button style={s.btn(true)} onClick={handleSave}>{editIdx !== null ? "保存修改" : "保存记录"}</button>
          </div>
        </>
      )}

      {/* ─── History ─── */}
      {view === "history" && (
        <>
          {records.length === 0 ? (
            <div style={{ ...s.card, textAlign: "center", padding: 32, color: "#94a3b8" }}>暂无记录</div>
          ) : (
            sorted.slice().reverse().map((r, revI) => {
              const idx = sorted.length - 1 - revI;
              const total = grandTotal(r.assets);
              return (
                <div key={idx} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.year}年{r.month}月</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#6366f1" }}>¥{formatMoney(total)}</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {ASSET_CATEGORIES.filter(c => catTotal(r.assets, c.key) > 0).map(c => (
                      <span key={c.key} style={{ ...s.tag(c.color), fontSize: 10 }}>{c.icon} ¥{formatMoneyShort(catTotal(r.assets, c.key))}</span>
                    ))}
                  </div>
                  {ASSET_CATEGORIES.filter(c => { const a = r.assets[c.key]; return a && typeof a === "object" && Object.values(a).some(v => v > 0); }).map(c => {
                    const entries = Object.entries(r.assets[c.key]).filter(([, v]) => v > 0);
                    return (
                      <div key={c.key} style={{ marginBottom: 4 }}>
                        {entries.map(([name, val]) => (
                          <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 2px 12px", borderLeft: `2px solid ${c.color}30` }}>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{name}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>¥{formatMoneyShort(val)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => handleEdit(idx)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" }}>✏️ 编辑</button>
                    {showConfirm === idx ? (
                      <button onClick={() => handleDelete(idx)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", background: "#fee2e2", fontSize: 12, fontWeight: 600, color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>确认删除？</button>
                    ) : (
                      <button onClick={() => setShowConfirm(idx)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1.5px solid #fecaca", background: "white", fontSize: 12, fontWeight: 600, color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>🗑️ 删除</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ─── Nav ─── */}
      <div style={s.nav}>
        <button style={s.navBtn(view === "dashboard")} onClick={() => setView("dashboard")}><span style={s.navIcon}>📊</span><span>总览</span></button>
        <button style={s.navBtn(view === "add")} onClick={() => { resetForm(); setView("add"); }}><span style={{ ...s.navIcon, fontSize: 28, marginTop: -6, color: view === "add" ? "#818cf8" : "#94a3b8" }}>⊕</span><span>记录</span></button>
        <button style={s.navBtn(view === "history")} onClick={() => setView("history")}><span style={s.navIcon}>📋</span><span>历史</span></button>
      </div>
    </div>
  );
}
