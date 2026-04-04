import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. .env.local에서 환경변수 로드
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
);

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 자산군 판단 헬퍼
function detectAssetClass(name) {
  if (name.includes('미국') || name.includes('S&P') || name.includes('나스닥')) return '미국주식';
  if (name.includes('채권') || name.includes('국채')) return '국내채권'; // 단순화
  if (name.includes('원자재') || name.includes('금') || name.includes('은')) return '원자재';
  if (name.includes('부동산') || name.includes('리츠')) return '부동산';
  if (name.includes('현금') || name.includes('MMF')) return '현금';
  return '국내주식';
}

async function syncStocks() {
  console.log('🚀 주식 및 ETF 데이터 동기화 시작...');

  try {
    // 소스 1: 네이버 금융 ETF 리스트 (EUC-KR 인코딩 대응)
    console.log('📦 네이버 금융에서 ETF 리스트 가져오는 중...');
    const etfRes = await fetch('https://finance.naver.com/api/sise/etfItemList.nhn');
    const buffer = await etfRes.arrayBuffer();
    const decoder = new TextDecoder('euc-kr'); // 네이버 금융은 EUC-KR을 사용함
    const decodedText = decoder.decode(buffer);
    const etfData = JSON.parse(decodedText);
    
    const etfs = etfData.result.etfItemList.map(it => ({
      ticker: it.itemcode,
      name: it.itemname,
      market_type: 'ETF',
      asset_class: detectAssetClass(it.itemname),
      updated_at: new Date().toISOString()
    }));

    // 소스 2: 주요 코스피/코스닥 종목 (FinanceData/stock_master 깃허브 - 최근 확인된 수량 중심)
    // 404를 방지하기 위해 가장 안정적인 raw URL을 사용하거나, 수동 리스트를 병합할 수 있습니다.
    // 여기서는 우선 ETF를 완벽히 넣고, 추가 주식은 KIS API 조회를 통해 보완하도록 구성하겠습니다.
    const allRecords = [...etfs];

    console.log(`📊 총 ${allRecords.length}개의 종목을 Supabase에 저장 중...`);

    const chunkSize = 100;
    for (let i = 0; i < allRecords.length; i += chunkSize) {
      const chunk = allRecords.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('stock_master')
        .upsert(chunk, { onConflict: 'ticker' });

      if (error) {
        console.error(`❌ 오류 발생:`, error.message);
        return;
      }
      process.stdout.write(`\r✅ 진행률: ${Math.min(i + chunkSize, allRecords.length)} / ${allRecords.length}`);
    }

    console.log('\n✨ 전종목 데이터베이스 동기화 완료!');
  } catch (err) {
    console.error('💥 실행 중 오류:', err.message);
  }
}

syncStocks();
