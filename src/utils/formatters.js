export const fmt = v => {
  const a = Math.abs(v);
  if (a >= 100000000) return (v / 100000000).toFixed(1) + "억";
  if (a >= 10000) return Math.round(v / 10000).toLocaleString() + "만";
  return Math.round(v).toLocaleString();
};

export const fmtP = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
export const fmtR = v => (v * 100).toFixed(1) + "%";
