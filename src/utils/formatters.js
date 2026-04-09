export const fmt = (value) => {
  const num = Number(value) || 0;
  const abs = Math.abs(num);

  if (abs >= 100000000) return `${(num / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(num / 10000).toLocaleString()}만`;
  return Math.round(num).toLocaleString();
};

export const fmtP = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export const fmtR = (value) => `${(value * 100).toFixed(1)}%`;
