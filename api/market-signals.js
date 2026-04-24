function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
}

async function fetchFearAndGreed() {
  try {
    const data = await fetchJson('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PensionPilot/1.0',
      },
    });

    const score = Number(data?.fear_and_greed?.score);
    if (!Number.isFinite(score)) throw new Error('Fear & Greed score missing');

    let label = '중립';
    if (score <= 24) label = '극단적 공포';
    else if (score <= 44) label = '공포';
    else if (score <= 55) label = '중립';
    else if (score <= 74) label = '탐욕';
    else label = '극단적 탐욕';

    return {
      score: Math.round(score * 10) / 10,
      label,
      labelKo: label,
      source: 'CNN',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      score: null,
      label: null,
      labelKo: null,
      source: 'CNN',
      updatedAt: null,
      error: error.message,
    };
  }
}

function parseFredCsvValue(csvText) {
  const lines = String(csvText || '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const [date, value] = lines[i].split(',');
    const parsed = Number(value);
    if (date && Number.isFinite(parsed)) return { date, value: parsed };
  }

  throw new Error('No valid FRED rows found');
}

async function fetchFredSeries(seriesId) {
  const csvText = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`);
  return parseFredCsvValue(csvText);
}

async function fetchFredSeriesHistory(seriesId, limit = 24) {
  const csvText = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`);
  return String(csvText || "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      return { date, value: Number(value) };
    })
    .filter((row) => row.date && Number.isFinite(row.value))
    .slice(-limit);
}

async function fetchYieldCurve() {
  try {
    const latest = await fetchFredSeries('T10Y2Y');
    const spread = latest.value;

    let status = '정상';
    let statusKo = '정상';
    if (spread < 0) status = '역전';
    else if (spread < 0.5) status = '평탄화';
    else if (spread > 1.5) status = '가팔름';
    if (status === '역전') statusKo = '역전';
    else if (status === '평탄화') statusKo = '평탄화';
    else if (status === '가팔름') statusKo = '가팔름';

    return {
      spread: Math.round(spread * 100) / 100,
      status,
      statusKo,
      date: latest.date,
      source: 'FRED',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      spread: null,
      status: null,
      date: null,
      source: 'FRED',
      updatedAt: null,
      error: error.message,
    };
  }
}

async function fetchCreditSpread() {
  try {
    const latest = await fetchFredSeries('BAMLH0A0HYM2');
    const spread = latest.value;

    let status = '정상';
    let statusKo = '정상';
    if (spread >= 6) status = '스트레스';
    else if (spread >= 4) status = '경계';
    else if (spread <= 3) status = '완화';
    if (status === '스트레스') statusKo = '스트레스';
    else if (status === '경계') statusKo = '경계';
    else if (status === '완화') statusKo = '완화';

    return {
      spread: Math.round(spread * 100) / 100,
      status,
      statusKo,
      date: latest.date,
      source: 'FRED',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      spread: null,
      status: null,
      date: null,
      source: 'FRED',
      updatedAt: null,
      error: error.message,
    };
  }
}

async function fetchUnemployment() {
  try {
    const history = await fetchFredSeriesHistory('UNRATE', 18);
    const latest = history[history.length - 1];
    if (!latest) throw new Error('UNRATE row missing');
    const trailing = history.slice(-12);
    const avg12m =
      trailing.length > 0
        ? trailing.reduce((sum, item) => sum + item.value, 0) / trailing.length
        : latest.value;
    const isBelow12mAvg = latest.value <= avg12m;
    return {
      rate: Math.round(latest.value * 10) / 10,
      avg12m: Math.round(avg12m * 10) / 10,
      isBelow12mAvg,
      date: latest.date,
      source: 'FRED',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      rate: null,
      date: null,
      source: 'FRED',
      updatedAt: null,
      error: error.message,
    };
  }
}

async function fetchCapeRatio() {
  try {
    const text = await fetchText('https://www.multpl.com/shiller-pe/download/csv');
    const lines = String(text || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const row = lines.slice(1).reverse().find((line) => {
      const [, value] = line.split(',');
      return Number.isFinite(Number(value));
    });
    if (!row) throw new Error('CAPE row missing');
    const [date, value] = row.split(',');
    const cape = Number(value);
    return {
      value: Math.round(cape * 100) / 100,
      regime: cape >= 30 ? '고평가' : cape <= 20 ? '저평가' : '중립',
      date,
      source: 'multpl',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      regime: null,
      date: null,
      source: 'multpl',
      updatedAt: null,
      error: error.message,
    };
  }
}

function hasUsableValue(item = {}) {
  return Object.entries(item).some(([key, value]) => {
    if (key === 'error') return false;
    return value != null && value !== '';
  });
}

function buildCompositeScore(fearGreed, yieldCurve, creditSpread, cape) {
  let score = 0;

  if (fearGreed?.score != null) {
    if (fearGreed.score <= 20) score += 3;
    else if (fearGreed.score <= 40) score += 2;
    else if (fearGreed.score <= 55) score += 1;
  }

  if (yieldCurve?.spread != null) {
    if (yieldCurve.spread < 0) score += 2;
    else if (yieldCurve.spread < 0.5) score += 1;
  }

  if (creditSpread?.spread != null) {
    if (creditSpread.spread >= 6) score += 2;
    else if (creditSpread.spread >= 4) score += 1;
  }

  if (cape?.value != null) {
    if (cape.value >= 30) score += 1;
    else if (cape.value <= 20) score -= 1;
  }

  return score;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(corsHeaders()).end();
  }

  try {
    const [fearGreed, yieldCurve, unemployment, creditSpread, cape] = await Promise.all([
      fetchFearAndGreed(),
      fetchYieldCurve(),
      fetchUnemployment(),
      fetchCreditSpread(),
      fetchCapeRatio(),
    ]);

    const items = { fearGreed, yieldCurve, unemployment, creditSpread, cape };
    const availableCount = Object.values(items).filter(hasUsableValue).length;
    const degraded = availableCount < Object.keys(items).length;
    const errors = Object.fromEntries(
      Object.entries(items)
        .filter(([, value]) => value?.error)
        .map(([key, value]) => [key, value.error])
    );

    return res.status(200).set(corsHeaders()).json({
      fearGreed,
      yieldCurve,
      unemployment,
      creditSpread,
      cape,
      compositeScore: buildCompositeScore(fearGreed, yieldCurve, creditSpread, cape),
      degraded,
      availableCount,
      errors,
      warning:
        availableCount === 0
          ? '시장 신호를 실시간으로 가져오지 못했습니다. 캐시나 대체 데이터가 표시될 수 있습니다.'
          : degraded
            ? '시장 신호 일부만 최신 조회에 성공했습니다. 표시값은 마지막 성공값 또는 조회 가능한 무료 데이터일 수 있습니다.'
            : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(200).set(corsHeaders()).json({
      fearGreed: null,
      yieldCurve: null,
      unemployment: null,
      creditSpread: null,
      cape: null,
      compositeScore: null,
      degraded: true,
      availableCount: 0,
      errors: { handler: error.message },
      warning: '시장 신호 조회 중 예외가 발생했습니다. 캐시 또는 수동 재시도를 이용해 주세요.',
      fetchedAt: new Date().toISOString(),
    });
  }
}
