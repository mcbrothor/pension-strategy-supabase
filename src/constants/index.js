export const ASSET_COLORS = {
  미국주식:"#185fa5", 선진국주식:"#0c447c", 신흥국주식:"#378add", 국내주식:"#3b6d11",
  미국장기채권:"#ba7517", 미국중기채권:"#ef9f27", 물가연동채:"#854f0b",
  회사채:"#d85a30", 하이일드채권:"#a32d2d", 신흥국채권:"#993c1d", 글로벌국채:"#712b13",
  금:"#639922", 원자재:"#97c459", 부동산리츠:"#534ab7", 현금MMF:"#888780",
};

export const ASSET_CLASSES = [
  "미국주식", "선진국주식", "신흥국주식", "국내주식",
  "미국장기채권", "미국중기채권", "물가연동채", "회사채",
  "하이일드채권", "신흥국채권", "글로벌국채",
  "금", "원자재", "부동산리츠", "현금MMF"
];

export const STRATEGIES = [
  { id:"60_40", type:"fixed", level:"초급", name:"60/40 포트폴리오", ret:"약 8%", mdd:"약 30%", rebal:"연 1회", irpRisk:60,
    annualRet:{cons:0.055,base:0.075,opt:0.095},
    desc:"가장 기본적인 주식·채권 분산. S&P500 60%로 성장을 추구하고 미국 중기채 40%로 변동성을 완충합니다.",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:60,risk:true},{name:"TIGER 미국채10년(H)",code:"305080",cls:"미국중기채권",w:40,risk:false}]},
  { id:"permanent", type:"fixed", level:"초급", name:"영구 포트폴리오", ret:"약 8%", mdd:"약 12.7%", rebal:"연 1회", irpRisk:50,
    annualRet:{cons:0.055,base:0.075,opt:0.090},
    desc:"해리 브라운의 전천후 전략. 주식·장기채·금·현금에 25%씩 균등 배분. 역대 MDD 12.7%.",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:25,risk:true},{name:"KODEX 미국채30년(H)",code:"308620",cls:"미국장기채권",w:25,risk:false},{name:"ACE KRX금현물",code:"411060",cls:"금",w:25,risk:true},{name:"KODEX KOFR금리액티브(합성)",code:"464330",cls:"현금MMF",w:25,risk:false}]},
  { id:"permanent_global", type:"fixed", level:"초급", name:"영구 포트폴리오 글로벌", ret:"약 8%", mdd:"약 15%", rebal:"연 1회", irpRisk:62.5,
    annualRet:{cons:0.055,base:0.075,opt:0.090},
    desc:"영구 포트폴리오의 글로벌 분산 버전. 신흥국·국내 주식을 추가해 지역 리스크를 낮춥니다.",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:12.5,risk:true},{name:"TIGER 신흥국MSCI",code:"195960",cls:"신흥국주식",w:12.5,risk:true},{name:"KODEX 미국채30년(H)",code:"308620",cls:"미국장기채권",w:12.5,risk:false},{name:"TIGER 미국채10년(H)",code:"305080",cls:"글로벌국채",w:12.5,risk:false},{name:"ACE KRX금현물",code:"411060",cls:"금",w:25,risk:true},{name:"KODEX KOFR금리액티브(합성)",code:"464330",cls:"현금MMF",w:12.5,risk:false},{name:"KODEX 200",code:"069500",cls:"국내주식",w:12.5,risk:true}]},
  { id:"allseason", type:"fixed", level:"초급", name:"사계절 포트폴리오", ret:"8~10%", mdd:"약 13.1%", rebal:"연 1회", irpRisk:45,
    annualRet:{cons:0.06,base:0.085,opt:0.105},
    desc:"레이 달리오의 대표 전략. 주식 30%, 장기채 40%, 중기채 15%, 금·원자재 각 7.5%로 경제 4계절을 모두 대비합니다.",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:30,risk:true},{name:"TIGER 미국채10년(H)",code:"305080",cls:"미국중기채권",w:15,risk:false},{name:"KODEX 미국채30년(H)",code:"308620",cls:"미국장기채권",w:40,risk:false},{name:"ACE KRX금현물",code:"411060",cls:"금",w:7.5,risk:true},{name:"KODEX 원자재선물(H)",code:"139290",cls:"원자재",w:7.5,risk:true}]},
  { id:"allweather", type:"fixed", level:"중급", name:"올웨더 2유형", ret:"8~10%", mdd:"20% 이하", rebal:"연 1회", irpRisk:50,
    annualRet:{cons:0.06,base:0.085,opt:0.105},
    desc:"절대수익 투자법칙의 올웨더 2유형. 글로벌 주식 3종 + 원자재·금 + 장기채·물가연동채·회사채·신흥국채권.",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:12,risk:true},{name:"TIGER 선진국MSCI World",code:"195980",cls:"선진국주식",w:12,risk:true},{name:"TIGER 신흥국MSCI",code:"195960",cls:"신흥국주식",w:12,risk:true},{name:"KODEX 원자재선물(H)",code:"139290",cls:"원자재",w:7,risk:true},{name:"ACE KRX금현물",code:"411060",cls:"금",w:7,risk:true},{name:"KODEX 미국채30년(H)",code:"308620",cls:"미국장기채권",w:18,risk:false},{name:"KODEX 미국물가연동채(H)",code:"294400",cls:"물가연동채",w:18,risk:false},{name:"TIGER 미국투자등급회사채(H)",code:"332620",cls:"회사채",w:7,risk:false},{name:"TIGER 이머징마켓채권(합성H)",code:"232080",cls:"신흥국채권",w:7,risk:false}]},
  { id:"gtaa5", type:"momentum", level:"초급", name:"GTAA 5 (파버)", ret:"8~10%", mdd:"약 15%", rebal:"월 1회", irpRisk:80,
    annualRet:{cons:0.06,base:0.085,opt:0.110},
    desc:"5개 자산을 10개월 이동평균 기준으로 편입·현금을 결정하는 절대 모멘텀 전략.",
    calc:"매월 말: 각 ETF 종가 ≥ 10개월 이동평균 → 보유(각 20%) / 이하 → KOFR금리ETF 교체",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:20,risk:true,note:"이평 이상 시"},{name:"TIGER 선진국MSCI World",code:"195980",cls:"선진국주식",w:20,risk:true,note:"이평 이상 시"},{name:"TIGER 미국채10년(H)",code:"305080",cls:"미국중기채권",w:20,risk:false,note:"이평 이상 시"},{name:"KODEX 원자재선물(H)",code:"139290",cls:"원자재",w:20,risk:true,note:"이평 이상 시"},{name:"TIGER 미국MSCI리츠(합성H)",code:"182480",cls:"부동산리츠",w:20,risk:true,note:"이평 이상 시"}]},
  { id:"dual_momentum", type:"momentum", level:"초급", name:"듀얼 모멘텀 (안토나치)", ret:"10~15%", mdd:"약 20%", rebal:"월 1회", irpRisk:100,
    annualRet:{cons:0.07,base:0.100,opt:0.130},
    desc:"상대 모멘텀(미국 vs 선진국)과 절대 모멘텀(KOFR 대비)을 결합. IRP에서 100% 주식 시 70% 제한 권장.",
    calc:"① S&P500 12M 수익률 > KOFR? YES→주식 NO→장기채 100%\n② 주식 시: S&P500 vs 선진국 12M 비교 → 높은 쪽 100%",
    etfs:[{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:null,risk:true,note:"모멘텀 1위 시 100%"},{name:"TIGER 선진국MSCI World",code:"195980",cls:"선진국주식",w:null,risk:true,note:"모멘텀 2위 시 100%"},{name:"KODEX 미국채30년(H)",code:"308620",cls:"미국장기채권",w:null,risk:false,note:"절대모멘텀 음수 시 100%"}]},
  { id:"laa", type:"momentum", level:"고급", name:"LAA (게으른 자산배분)", ret:"약 10%", mdd:"약 13%", rebal:"월 1회", irpRisk:75,
    annualRet:{cons:0.065,base:0.090,opt:0.115},
    desc:"75%를 고정 보유하고 25%만 모멘텀 운용하는 하이브리드 전략. 거래 빈도 낮고 세금 효율이 높습니다.",
    calc:"매월 말 (25%만): S&P500 < 200일 이평 AND 실업률 > 12M 이평\n→ 나스닥100 → KOFR금리ETF 교체 / 미충족 → 나스닥100 유지",
    etfs:[{name:"KODEX 200",code:"069500",cls:"국내주식",w:25,risk:true,note:"고정"},{name:"ACE KRX금현물",code:"411060",cls:"금",w:25,risk:true,note:"고정"},{name:"TIGER 미국채10년(H)",code:"305080",cls:"미국중기채권",w:25,risk:false,note:"고정"},{name:"TIGER 미국나스닥100",code:"133690",cls:"미국주식",w:25,risk:true,note:"조건부"}]},
  { id:"daa", type:"momentum", level:"고급", name:"DAA (방어적 자산배분)", ret:"10~15%", mdd:"약 10%", rebal:"월 1회", irpRisk:100,
    annualRet:{cons:0.07,base:0.100,opt:0.130},
    desc:"카나리아 자산(신흥국주식·장기채) 모멘텀으로 공격/방어 비중을 0/50/100%로 동적 결정.",
    calc:"카나리아(신흥국MSCI, 미국채30년) 모멘텀:\n둘 다>0→공격100% / 하나>0→공격50% / 둘 다≤0→안전100%\n모멘텀스코어=12×1M+4×3M+2×6M+1×12M",
    etfs:[{name:"TIGER 신흥국MSCI(카나리아)",code:"195960",cls:"신흥국주식",w:null,risk:true,note:"카나리아"},{name:"KODEX 미국채30년(H)(카나리아)",code:"308620",cls:"미국장기채권",w:null,risk:false,note:"카나리아"},{name:"TIGER 미국S&P500",code:"360750",cls:"미국주식",w:null,risk:true,note:"공격형 풀"},{name:"TIGER 미국나스닥100",code:"133690",cls:"미국주식",w:null,risk:true,note:"공격형 풀"},{name:"ACE KRX금현물",code:"411060",cls:"금",w:null,risk:true,note:"공격형 풀"},{name:"KODEX KOFR금리액티브(합성)",code:"464330",cls:"현금MMF",w:null,risk:false,note:"안전자산 풀"}]},
];

export const ZONES = [
  {max:15,  lbl:"안정",  mode:"관망",       color:"#185fa5", bg:"#e6f1fb", desc:"시장 낙관 과도. 신규 매수보다 현재 비중 유지 권장."},
  {max:25,  lbl:"중립",  mode:"정상 운영",  color:"#3b6d11", bg:"#eaf3de", desc:"정상 변동성. 선택 전략 기준 비중 유지, 정기 적립 지속."},
  {max:35,  lbl:"불안",  mode:"방어 모드",  color:"#ba7517", bg:"#faeeda", desc:"시장 불안 감지. 주식 5~10%p 축소, 채권·현금 이동 검토."},
  {max:999, lbl:"공황",  mode:"역발상 매수",color:"#a32d2d", bg:"#fcebeb", desc:"극단적 공포. 분할 매수 기회. MDD 제한선 초과 시 추가 매수 중단."},
];

export const DEMO_PORTFOLIO = {
  strategy:"allseason", accountType:"IRP", lastRebalDate:"2025-01-15",
  rebalPeriod:"연 1회", stopLoss:-20, mddLimit:-15, mdd:-6.8,
  total:54320000,
  holdings:[
    {etf:"TIGER 미국S&P500",    code:"360750",cls:"미국주식",     target:30, amt:17230000,costAmt:15800000},
    {etf:"TIGER 미국채10년(H)", code:"305080",cls:"미국중기채권", target:15, amt:7480000, costAmt:7200000},
    {etf:"KODEX 미국채30년(H)", code:"308620",cls:"미국장기채권", target:40, amt:22910000,costAmt:21500000},
    {etf:"ACE KRX금현물",       code:"411060",cls:"금",           target:7.5,amt:3560000, costAmt:3100000},
    {etf:"KODEX 원자재선물(H)", code:"139290",cls:"원자재",        target:7.5,amt:3140000, costAmt:3600000},
  ],
  history:[
    {date:"10/15",strategy:"사계절",total:48500000,weights:{미국주식:29.8,미국중기채권:14.9,미국장기채권:39.5,금:8.2,원자재:7.6}},
    {date:"11/20",strategy:"사계절",total:50200000,weights:{미국주식:30.4,미국중기채권:15.1,미국장기채권:40.2,금:7.8,원자재:6.5}},
    {date:"12/18",strategy:"사계절",total:51800000,weights:{미국주식:31.0,미국중기채권:14.7,미국장기채권:40.8,금:7.4,원자재:6.1}},
    {date:"01/15",strategy:"사계절",total:53100000,weights:{미국주식:31.5,미국중기채권:14.2,미국장기채권:41.5,금:6.9,원자재:5.9}},
    {date:"오늘",  strategy:"사계절",total:54320000,weights:{미국주식:31.7,미국중기채권:13.8,미국장기채권:42.2,금:6.6,원자재:5.7}},
  ],
};

export const RISK_DATA = {
  "미국주식": 0.18, "선진국주식": 0.17, "신흥국주식": 0.25, "국내주식": 0.22,
  "미국장기채권": 0.12, "미국중기채권": 0.05, "물가연동채": 0.06,
  "회사채": 0.08, "하이일드채권": 0.15, "신흥국채권": 0.14, "글로벌국채": 0.07,
  "금": 0.16, "원자재": 0.22, "부동산리츠": 0.18, "현금MMF": 0.01
};
