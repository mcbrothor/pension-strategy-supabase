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
      source: 'CNN',
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      score: null,
      label: null,
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

async function fetchYieldCurve() {
  try {
    const latest = await fetchFredSeries('T10Y2Y');
    const spread = latest.value;

    let status = '정상';
    if (spread < 0) status = '역전';
    else if (spread < 0.5) status = '평탄';
    else if (spread > 1.5) status = '가팔름';

    return {
      spread: Math.round(spread * 100) / 100,
      status,
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
    const latest = await fetchFredSeries('UNRATE');
    return {
      rate: Math.round(latest.value * 10) / 10,
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

function buildCompositeScore(fearGreed, yieldCurve) {
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

  return score;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(corsHeaders()).end();
  }

  try {
    const [fearGreed, yieldCurve, unemployment] = await Promise.all([
      fetchFearAndGreed(),
      fetchYieldCurve(),
      fetchUnemployment(),
    ]);

    const allFailed = [fearGreed, yieldCurve, unemployment].every(
      (item) => item.error && Object.values(item).every((value) => value == null || typeof value === 'string')
    );

    if (allFailed) {
      return res.status(500).set(corsHeaders()).json({
        error: '시장 신호를 모두 불러오지 못했습니다.',
        fearGreed,
        yieldCurve,
        unemployment,
        fetchedAt: new Date().toISOString(),
      });
    }

    return res.status(200).set(corsHeaders()).json({
      fearGreed,
      yieldCurve,
      unemployment,
      compositeScore: buildCompositeScore(fearGreed, yieldCurve),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).set(corsHeaders()).json({
      error: error.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}
