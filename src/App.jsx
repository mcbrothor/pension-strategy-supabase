/**
 * 연금 포트폴리오 파일럿 — 통합 웹앱
 * PensionPilot v4.0
 *
 * 탭 구성:
 *   대시보드        — VIX 신호 + 포트폴리오 현황 요약
 *   투자 전략       — 16종 전략 선택 (IRP 적합성 · ETF 매핑)
 *   리밸런싱 판단   — 시점·근거·실행 지시 3단계
 *   은퇴 로드맵     — 목표 역산 · 시나리오 · 갭 해소
 *   비중 비교       — 현재 vs 목표 편차
 *   경고·손절       — 알림 목록 · 손절 기준
 *   변동 추이       — 히스토리 차트
 *   월간 리포트     — PDF 출력
 *   시트 연동       — Apps Script 배포 URL 연결
 */

import { useState, useMemo, useEffect } from "react";
import { supabase } from "./lib/supabase";

// ═══════════════════════════════════════════════════════════════════════════
// 1. 상수 / 데이터 정의
// ═══════════════════════════════════════════════════════════════════════════

const ASSET_COLORS = {
  미국주식:"#185fa5", 선진국주식:"#0c447c", 신흥국주식:"#378add", 국내주식:"#3b6d11",
  미국장기채권:"#ba7517", 미국중기채권:"#ef9f27", 물가연동채:"#854f0b",
  회사채:"#d85a30", 하이일드채권:"#a32d2d", 신흥국채권:"#993c1d", 글로벌국채:"#712b13",
  금:"#639922", 원자재:"#97c459", 부동산리츠:"#534ab7", 현금MMF:"#888780",
};

const ASSET_CLASSES = [
  "미국주식", "선진국주식", "신흥국주식", "국내주식",
  "미국장기채권", "미국중기채권", "물가연동채", "회사채",
  "하이일드채권", "신흥국채권", "글로벌국채",
  "금", "원자재", "부동산리츠", "현금MMF"
];

const STRATEGIES = [
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

const ZONES = [
  {max:15,  lbl:"안정",  mode:"관망",       color:"#185fa5", bg:"#e6f1fb", desc:"시장 낙관 과도. 신규 매수보다 현재 비중 유지 권장."},
  {max:25,  lbl:"중립",  mode:"정상 운영",  color:"#3b6d11", bg:"#eaf3de", desc:"정상 변동성. 선택 전략 기준 비중 유지, 정기 적립 지속."},
  {max:35,  lbl:"불안",  mode:"방어 모드",  color:"#ba7517", bg:"#faeeda", desc:"시장 불안 감지. 주식 5~10%p 축소, 채권·현금 이동 검토."},
  {max:999, lbl:"공황",  mode:"역발상 매수",color:"#a32d2d", bg:"#fcebeb", desc:"극단적 공포. 분할 매수 기회. MDD 제한선 초과 시 추가 매수 중단."},
];

const DEMO_PORTFOLIO = {
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

// ═══════════════════════════════════════════════════════════════════════════
// 2. 유틸리티 함수
// ═══════════════════════════════════════════════════════════════════════════
const fmt = v=>{const a=Math.abs(v);if(a>=100000000)return(v/100000000).toFixed(1)+"억";if(a>=10000)return Math.round(v/10000).toLocaleString()+"만";return Math.round(v).toLocaleString();};
const fmtP= v=>(v>=0?"+":"")+v.toFixed(1)+"%";
const fmtR= v=>(v*100).toFixed(1)+"%";
const getZone = v => ZONES.find(z=>v<z.max)||ZONES[3];
const getStrat = id => STRATEGIES.find(s=>s.id===id)||STRATEGIES[3];
const irpLimit = acc => acc==="연금저축"?100:70;

function simulate(init,monthly,rate,years){
  const r=rate/12; let b=init;
  const t=[{y:0,b}];
  for(let yr=1;yr<=years;yr++){for(let m=0;m<12;m++)b=b*(1+r)+monthly;t.push({y:yr,b:Math.round(b)});}
  return t;
}
function calcNeededContrib(target,rate,years,init){
  const r=rate/12,fv=init*Math.pow(1+r,years*12),rem=target-fv;
  if(rem<=0)return 0;
  return Math.ceil(rem/((Math.pow(1+r,years*12)-1)/r)/10000)*10000;
}
function checkWithdraw(bal,monthly,rate,years){
  const r=rate/12; let b=bal;
  for(let m=0;m<years*12;m++){b=b*(1+r)-monthly;if(b<=0)return{ok:false,yr:Math.floor(m/12)};}
  return{ok:true,rem:Math.round(b)};
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 공통 UI 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════
const Card=({children,style,accent})=>(
  <div style={{background:"var(--color-background-primary)",border:`${accent?"2px":"0.5px"} solid ${accent||"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-lg)",padding:"1.25rem",marginBottom:"1rem",...style}}>
    {children}
  </div>
);
const ST=({children})=><div style={{fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:".75rem",letterSpacing:".04em"}}>{children}</div>;
const Badge=({children,c,bg})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:600,background:bg,color:c,display:"inline-block"}}>{children}</span>;
const Btn=({children,onClick,primary,danger,sm,style})=>(
  <button onClick={onClick} style={{padding:sm?"5px 12px":"8px 20px",border:`0.5px solid ${primary||danger?"transparent":"var(--color-border-secondary)"}`,borderRadius:"var(--border-radius-md)",background:danger?"#a32d2d":primary?"var(--color-text-primary)":"none",color:danger||primary?"var(--color-background-primary)":"var(--color-text-primary)",fontSize:sm?11:13,fontWeight:500,cursor:"pointer",fontFamily:"var(--font-sans)",...style}}>
    {children}
  </button>
);

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000, padding: "1.5rem"
    }} onClick={onClose}>
      <div style={{
        backgroundColor: "var(--color-background-primary)",
        borderRadius: "var(--border-radius-lg)",
        width: "100%", maxWidth: "400px",
        padding: "1.75rem",
        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        animation: "modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
      }} onClick={e => e.stopPropagation()}>
        <style>{`
          @keyframes modal-in {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: "0.75rem", color: "var(--color-text-primary)" }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "2rem" }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Btn style={{ flex: 1, height: 44 }} onClick={onClose}>아니오</Btn>
          <Btn primary style={{ flex: 1, height: 44 }} onClick={() => { onConfirm(); onClose(); }}>네, 적용합니다</Btn>
        </div>
      </div>
    </div>
  );
};

const MetaCard=({label,value,sub,subColor})=>(
  <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:".875rem",textAlign:"center"}}>
    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{label}</div>
    <div style={{fontSize:19,fontWeight:500}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:subColor||"var(--color-text-secondary)",fontWeight:500,marginTop:2}}>{sub}</div>}
  </div>
);
const AllocBar=({label,pct,target,color})=>(
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
    <div style={{fontSize:11,minWidth:130,color:"var(--color-text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
    <div style={{flex:1,height:7,background:"var(--color-background-secondary)",borderRadius:4,overflow:"hidden",position:"relative",minWidth:60}}>
      <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:color,borderRadius:4}}/>
      {target!=null&&<div style={{position:"absolute",top:0,left:`${Math.min(target,100)}%`,width:2,height:"100%",background:"var(--color-text-primary)",opacity:.3}}/>}
    </div>
    <span style={{fontSize:11,fontWeight:500,minWidth:30,textAlign:"right"}}>{pct.toFixed(1)}%</span>
    {target!=null&&<span style={{fontSize:10,minWidth:44,textAlign:"right",color:Math.abs(pct-target)>=5?(pct>target?"#a32d2d":"#0c447c"):"#3b6d11"}}>{fmtP(pct-target)}</span>}
  </div>
);
const VixBar=({vix})=>{
  const pct=Math.min(Math.max(vix/50*100,2),98);
  return(
    <div>
      <div style={{height:9,borderRadius:5,background:"linear-gradient(to right,#185fa5,#639922,#ba7517,#d85a30,#a32d2d)",position:"relative",margin:"8px 0 3px"}}>
        <div style={{position:"absolute",top:-5,left:`${pct}%`,width:3,height:19,background:"var(--color-text-primary)",borderRadius:1,transform:"translateX(-50%)"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--color-text-secondary)"}}>
        <span>0 안정</span><span>15</span><span>25</span><span>35</span><span>50+</span>
      </div>
    </div>
  );
};
const ReasonBox=({type,title,body})=>{
  const tC={ok:"#27500a",warn:"#633806",danger:"#791f1f",info:"#0c447c"};
  const tB={ok:"#eaf3de",warn:"#faeeda",danger:"#fcebeb",info:"#e6f1fb"};
  return(
    <div style={{background:tB[type],borderRadius:"var(--border-radius-md)",padding:".875rem 1rem",marginBottom:8,borderLeft:`3px solid ${tC[type]}`}}>
      <div style={{fontSize:12,fontWeight:600,color:tC[type],marginBottom:3}}>{title}</div>
      <div style={{fontSize:12,color:tC[type],opacity:.9,lineHeight:1.6}}>{body}</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. 화면별 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════

// ─── 4-1. 대시보드 ─────────────────────────────────────────────────────────
const HoldingsCard = ({ holdings, total }) => {
  return (
    <Card style={{ height: "100%", marginBottom: 0 }}>
      <ST>현재 보유 종목 상세</ST>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {holdings.map((h, i) => {
          const pnl = h.costAmt > 0 ? ((h.amt - h.costAmt) / h.costAmt * 100).toFixed(1) : null;
          const pnlColor = pnl > 0 ? "#a32d2d" : pnl < 0 ? "#0c447c" : "var(--color-text-secondary)";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 8, background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)"
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{h.etf.replace(" (H)", "")}</span>
                  <Badge c="var(--color-text-secondary)" bg="var(--color-background-primary)">{h.cls}</Badge>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  {h.code && <span style={{ fontFamily: "monospace", marginRight: 8 }}>{h.code}</span>}
                  비중 {h.cur}%
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(h.amt)}원</div>
                {pnl !== null && (
                  <div style={{ fontSize: 11, fontWeight: 500, color: pnlColor }}>
                    {pnl > 0 ? "▲" : pnl < 0 ? "▼" : ""} {pnl}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {holdings.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 12 }}>
          보유 중인 종목이 없습니다.<br/>[종목 입력] 탭에서 잔고를 입력하세요.
        </div>
      )}
    </Card>
  );
};

function Dashboard({portfolio,vix,vixLoading,onFetchVix,onGo}){
  const z=getZone(vix);
  const s=getStrat(portfolio.strategy);
  const total=portfolio.total;
  const holdings=portfolio.holdings.map(h=>{
    const cur=Math.round(h.amt/total*1000)/10;
    return{...h,cur,diff:Math.round((cur-h.target)*10)/10};
  });
  const riskPct=Math.round(holdings.filter(h=>["미국주식","선진국주식","신흥국주식","국내주식","금","원자재","부동산리츠"].includes(h.cls)).reduce((s,h)=>s+h.cur,0)*10)/10;

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:8,marginBottom:"1rem"}}>
        <MetaCard label="총 평가금액" value={fmt(total)+"원"} sub={new Date().toLocaleDateString("ko-KR")} />
        <MetaCard label="현재 VIX" value={vixLoading?"…":vix.toFixed(1)} sub={z.lbl+" / "+z.mode} subColor={z.color}/>
        <MetaCard label="MDD" value={portfolio.mdd.toFixed(1)+"%"} sub={"제한선 "+portfolio.mddLimit+"%"} subColor={portfolio.mdd<portfolio.mddLimit?"#a32d2d":"#3b6d11"}/>
        <MetaCard label="선택 전략" value={s.name} sub={s.rebal} style={{fontSize:13}}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1rem", alignItems: "start" }}>
        {/* 좌측 컬럼: 요약 및 신호 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".875rem"}}>
              <ST>포트폴리오 vs 목표 비중</ST>
              <Btn sm onClick={onFetchVix}>{vixLoading?"갱신 중…":"VIX 갱신"}</Btn>
            </div>
            {holdings.map((h,i)=>(
              <AllocBar key={i} label={h.etf} pct={h.cur} target={h.target} color={ASSET_COLORS[h.cls]||"#888"}/>
            ))}
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <ST>VIX 전략 신호</ST>
            <VixBar vix={vix}/>
            <div style={{background:z.bg,borderRadius:"var(--border-radius-md)",padding:".875rem 1rem",marginTop:10}}>
              <Badge c={z.color} bg={z.color+"20"}>{z.mode}</Badge>
              <span style={{fontSize:12,color:z.color,marginLeft:8,lineHeight:1.7}}>{z.desc}</span>
            </div>
          </Card>

          {portfolio.holdings.some(h=>{const cur=Math.round(h.amt/total*1000)/10;return Math.abs(cur-h.target)>=5;})&&(
            <div style={{background:"#faeeda",borderRadius:"var(--border-radius-md)",padding:".875rem 1rem",fontSize:12,color:"#633806"}}>
              5%p 이상 이탈 자산이 있습니다. 리밸런싱 판단 탭을 확인하세요.
            </div>
          )}

          {portfolio.accountType==="IRP"&&(
            <div style={{background:"#eaf3de",borderRadius:"var(--border-radius-md)",padding:".875rem 1rem",fontSize:12,color:"#27500a"}}>
              IRP 위험자산 목표 비중은 70%를 넘지 않도록 자동 조정됩니다.
            </div>
          )}

          {s.type==="momentum"&&(
            <div style={{background:"#e6f1fb",borderRadius:"var(--border-radius-md)",padding:".875rem 1rem",fontSize:12,color:"#0c447c"}}>
              모멘텀 전략의 목표 비중은 서버리스(`/api/momentum`) 계산 결과를 기준으로 갱신됩니다.
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:"0.5rem"}}>
            <Btn onClick={()=>onGo("rebalance")}>리밸런싱 판단 →</Btn>
            <Btn primary onClick={()=>onGo("roadmap")}>은퇴 로드맵 →</Btn>
          </div>
        </div>

        {/* 우측 컬럼: 보유 종목 상세 */}
        <HoldingsCard holdings={holdings} total={total} />
      </div>
    </div>
  );
}

// ─── 4-2. 투자 전략 ────────────────────────────────────────────────────────
function StrategySelect({accountType,onStrategyApply}){
  const [acc,setAcc]=useState(accountType||"IRP");
  const [filt,setFilt]=useState("all");
  const [sel,setSel]=useState(null);
  const limit=irpLimit(acc);
  const vis=STRATEGIES.filter(s=>filt==="all"||s.type===filt);

  function irpBadge(s){
    if(acc==="연금저축") return{lbl:"제한 없음",c:"#27500a",bg:"#eaf3de"};
    const r=s.irpRisk;
    if(r>limit) return{lbl:`IRP 주의 (${r}%)`,c:"#633806",bg:"#faeeda"};
    return{lbl:`IRP 적합 (${r}%)`,c:"#27500a",bg:"#eaf3de"};
  }
  const lvC={초급:"#085041",중급:"#0c447c",고급:"#26215c"};
  const lvB={초급:"#e1f5ee",중급:"#e6f1fb",고급:"#eeedfe"};
  const selS=STRATEGIES.find(s=>s.id===sel);

  return(
    <div>
      {/* 계좌 유형 */}
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:500,marginBottom:3}}>투자 전략 선택</div>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>삼성증권 연금계좌 실제 매수 가능 ETF 기준</div>
          </div>
          <div style={{display:"flex",gap:5}}>
            {["IRP","연금저축","혼합"].map(t=>(
              <Btn key={t} sm onClick={()=>setAcc(t)} primary={acc===t}>{t}</Btn>
            ))}
          </div>
        </div>
      </Card>

      {/* 필터 */}
      <div style={{display:"flex",gap:6,marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {[["all","전체",null],["fixed","실행 가능 — 고정비중","#3b6d11"],["momentum","자동 계산 — 모멘텀","#ba7517"]].map(([f,lbl,col])=>(
          <Btn key={f} sm onClick={()=>setFilt(f)} style={{background:filt===f?(col||"var(--color-text-primary)"):"none",color:filt===f?"#fff":"var(--color-text-secondary)",borderColor:filt===f?"transparent":"var(--color-border-secondary)"}}>
            {lbl} ({f==="all"?STRATEGIES.length:STRATEGIES.filter(s=>s.type===f).length})
          </Btn>
        ))}
      </div>

      {/* 카드 그리드 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(195px,1fr))",gap:10,marginBottom:"1.5rem"}}>
        {vis.map(s=>{
          const irp=irpBadge(s);
          const isSel=s.id===sel;
          return(
            <div key={s.id} onClick={()=>setSel(s.id===sel?null:s.id)}
              style={{background:"var(--color-background-primary)",border:`${isSel?"2px":"0.5px"} solid ${isSel?(s.type==="fixed"?"#3b6d11":"#ba7517"):"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-lg)",padding:"1rem",cursor:"pointer"}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:7}}>
                <Badge c={s.type==="fixed"?"#27500a":"#633806"} bg={s.type==="fixed"?"#eaf3de":"#faeeda"}>{s.type==="fixed"?"실행가능":"자동 계산"}</Badge>
                <Badge c={lvC[s.level]} bg={lvB[s.level]}>{s.level}</Badge>
                <Badge c={irp.c} bg={irp.bg}>{irp.lbl}</Badge>
              </div>
              <div style={{fontSize:13,fontWeight:500,marginBottom:6,lineHeight:1.4}}>{s.name}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>수익 <strong style={{color:"var(--color-text-primary)"}}>{s.ret}</strong></span>
                <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>MDD <strong style={{color:"var(--color-text-primary)"}}>{s.mdd}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 상세 패널 */}
      {selS&&(
        <Card>
              <div style={{display:"flex",gap:7,marginBottom:8,flexWrap:"wrap"}}>
            <Badge c={selS.type==="fixed"?"#27500a":"#633806"} bg={selS.type==="fixed"?"#eaf3de":"#faeeda"}>
                  {selS.type==="fixed"?"고정비중 — 즉시 실행 가능":"모멘텀 — 매월 자동 계산"}
            </Badge>
          </div>
          <div style={{fontSize:15,fontWeight:500,marginBottom:5}}>{selS.name}</div>
          <div style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.6,marginBottom:10}}>{selS.desc}</div>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"1.5rem"}}>
            <div>
              {/* IRP 바 */}
              {acc!=="연금저축"&&(()=>{
                const r=selS.irpRisk,bC=r>limit?"#a32d2d":r>limit*.85?"#ba7517":"#3b6d11";
                return(
                  <div style={{marginBottom:"1rem"}}>
                    <div style={{height:9,background:"var(--color-background-secondary)",borderRadius:5,overflow:"hidden",position:"relative",margin:"4px 0 3px"}}>
                      <div style={{height:"100%",width:`${Math.min(r,100)}%`,background:bC,borderRadius:5}}/>
                      <div style={{position:"absolute",top:0,left:`${limit}%`,width:2,height:"100%",background:"#a32d2d",opacity:.6,transform:"translateX(-50%)"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--color-text-secondary)",marginBottom:4}}><span>0%</span><span style={{color:"#a32d2d",fontWeight:600}}>{limit}% 한도</span><span>100%</span></div>
                    <div style={{fontSize:12,fontWeight:500,color:bC}}>{r>limit?`⚠ 위험자산 ${r}% — 한도 초과`:r>limit*.85?`△ 위험자산 ${r}% — 한도 근접`:`✓ 위험자산 ${r}% — IRP 적합`}</div>
                  </div>
                );
              })()}
              {/* 모멘텀 계산 */}
              {selS.type==="momentum"&&selS.calc&&(
                <div style={{background:"#faeeda",border:"0.5px solid #f0a500",borderRadius:8,padding:".875rem",marginBottom:"1rem",fontSize:11,color:"#633806",lineHeight:1.8,fontFamily:"var(--font-mono)",whiteSpace:"pre-wrap"}}>
                  <div style={{fontWeight:600,marginBottom:5,fontFamily:"var(--font-sans)"}}>매월 계산 방법</div>
                  {selS.calc}
                </div>
              )}
              {/* ETF 테이블 */}
              <ST>{selS.type==="fixed"?"구성 ETF (삼성증권 연금계좌 매수 가능)":"대상 ETF 풀"}</ST>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                  <th style={{textAlign:"left",padding:"4px 6px",fontSize:10,color:"var(--color-text-secondary)",fontWeight:600}}>ETF명</th>
                  <th style={{textAlign:"left",padding:"4px 6px",fontSize:10,color:"var(--color-text-secondary)",fontWeight:600}}>코드</th>
                  <th style={{textAlign:"left",padding:"4px 6px",fontSize:10,color:"var(--color-text-secondary)",fontWeight:600}}>{selS.type==="fixed"?"비중":"역할"}</th>
                  <th style={{textAlign:"left",padding:"4px 6px",fontSize:10,color:"var(--color-text-secondary)",fontWeight:600}}>위험</th>
                </tr></thead>
                <tbody>{selS.etfs.map((e,i)=>(
                  <tr key={i} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                    <td style={{padding:"6px 6px"}}><div style={{fontWeight:500,fontSize:12}}>{e.name}</div><div style={{fontSize:10,color:"var(--color-text-secondary)"}}>{e.cls}</div></td>
                    <td style={{padding:"6px 6px"}}><span style={{fontFamily:"monospace",fontSize:10,background:"var(--color-background-secondary)",padding:"1px 4px",borderRadius:3,color:"var(--color-text-secondary)"}}>{e.code}</span></td>
                    <td style={{padding:"6px 6px"}}>
                      {selS.type==="fixed"&&e.w!=null
                        ?<div style={{display:"flex",alignItems:"center",gap:5}}><div style={{flex:1,height:5,background:"var(--color-background-secondary)",borderRadius:3,overflow:"hidden",minWidth:40}}><div style={{height:"100%",width:`${e.w}%`,background:ASSET_COLORS[e.cls]||"#888",borderRadius:3}}/></div><span style={{fontSize:11,fontWeight:600,minWidth:26,textAlign:"right"}}>{e.w}%</span></div>
                        :<span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{e.note||"-"}</span>}
                    </td>
                    <td style={{padding:"6px 6px"}}><span style={{fontSize:9,padding:"2px 5px",borderRadius:3,fontWeight:600,background:e.risk?"#fcebeb":"#eaf3de",color:e.risk?"#791f1f":"#27500a"}}>{e.risk?"위험":"안전"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div>
              <ST>{selS.type==="fixed"?"자산군별 배분":"자산군 분류"}</ST>
              {selS.type==="fixed"
                ?selS.etfs.map((e,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}>
                    <div style={{fontSize:11,minWidth:120,color:"var(--color-text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name.replace(" (H)","").replace("(합성H)","")}</div>
                    <div style={{flex:1,height:7,background:"var(--color-background-secondary)",borderRadius:4,overflow:"hidden",minWidth:50}}><div style={{height:"100%",width:`${e.w}%`,background:ASSET_COLORS[e.cls]||"#888",borderRadius:4}}/></div>
                    <span style={{fontSize:12,fontWeight:500,minWidth:28,textAlign:"right"}}>{e.w}%</span>
                  </div>
                ))
                :[...new Set(selS.etfs.map(e=>e.cls))].map(cls=>(
                  <div key={cls} style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                    <div style={{width:10,height:10,borderRadius:2,background:ASSET_COLORS[cls]||"#888",flexShrink:0}}/>
                    <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{cls}</span>
                  </div>
                ))
              }
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"1rem",paddingTop:"1rem",borderTop:"0.5px solid var(--color-border-tertiary)",flexWrap:"wrap",gap:10}}>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{selS.type==="fixed"?`[투자전략설정] 시트 B1에 "${selS.id}" 입력 · 리밸런싱: ${selS.rebal}`:`매월 계산 후 [종목 입력] 시트에 기록 · 리밸런싱: ${selS.rebal}`}</div>
            <Btn primary={selS.type==="fixed"} style={selS.type!=="fixed"?{background:"#ba7517",color:"#fff",borderColor:"transparent"}:{}} onClick={()=>onStrategyApply&&onStrategyApply(selS.id)}>
              {selS.type==="fixed"?"이 전략 적용하기":"모멘텀 자동 계산 적용"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── 4-3. 리밸런싱 판단 ────────────────────────────────────────────────────
function RebalanceJudge({portfolio,vix}){
  const [step,setStep]=useState(0);
  const [checked,setChecked]=useState({});
  const REBAL_DAYS={"연 1회":365,"분기 1회":90,"월 1회":30};
  const required=REBAL_DAYS[portfolio.rebalPeriod]||365;
  const elapsed=Math.floor((new Date()-new Date(portfolio.lastRebalDate))/86400000);
  const isOverdue=elapsed>=required, isTime=elapsed>=required*0.9;
  const z=getZone(vix);
  const total=portfolio.total;

  const holdings=portfolio.holdings.map(h=>{
    const cur=Math.round(h.amt/total*1000)/10;
    const diff=Math.round((cur-h.target)*10)/10;
    const pnlPct=h.costAmt>0?Math.round((h.amt-h.costAmt)/h.costAmt*1000)/10:null;
    const targetAmt=Math.round(total*h.target/100);
    const actionAmt=Math.round((h.amt-targetAmt)/10000)*10000;
    return{...h,cur,diff,pnlPct,targetAmt,actionAmt};
  });

  const irpRisk=Math.round(holdings.filter(h=>["미국주식","선진국주식","신흥국주식","국내주식","금","원자재","부동산리츠"].includes(h.cls)).reduce((s,h)=>s+h.cur,0)*10)/10;
  const sells=holdings.filter(h=>h.actionAmt>5000);
  const buys=holdings.filter(h=>h.actionAmt<-5000);
  const holds=holdings.filter(h=>Math.abs(h.actionAmt)<=5000);
  const stopLossItems=holdings.filter(h=>h.pnlPct!==null&&h.pnlPct<portfolio.stopLoss);

  const reasons=[
    {type:isOverdue?"danger":isTime?"warn":"ok",title:`리밸런싱 주기: ${portfolio.rebalPeriod} — ${elapsed}일 경과`,body:isOverdue?`기준(${required}일) 초과 — 즉시 실행 권장.`:isTime?`기준의 90% 도달 — 실행 시점.`:`${required-elapsed}일 후 예정.`},
    {type:vix>35?"danger":vix>25?"warn":"ok",title:`VIX ${vix.toFixed(1)} — ${z.lbl} (${z.mode})`,body:z.desc},
    {type:portfolio.mdd<portfolio.mddLimit?"danger":"ok",title:`MDD ${portfolio.mdd.toFixed(1)}% (제한선 ${portfolio.mddLimit}%)`,body:portfolio.mdd<portfolio.mddLimit?"MDD 제한선 초과 — 방어 자산 비중 확보 우선.":"MDD 정상 범위. 전략 기준대로 진행하세요."},
    ...(portfolio.accountType==="IRP"?[{type:irpRisk>70?"danger":irpRisk>65?"warn":"ok",title:`IRP 위험자산 ${irpRisk}% (한도 70%)`,body:irpRisk>70?"IRP 한도 초과. 주식·금·원자재 비중을 70% 이하로 맞추세요.":"IRP 위험자산 정상 범위."}]:[]),
    ...(stopLossItems.length>0?[{type:"danger",title:`손절 경고: ${stopLossItems.map(h=>h.etf).join(", ")}`,body:`손절 기준(${portfolio.stopLoss}%) 초과. 우선 매도 후 리밸런싱하세요.`}]:[]),
    ...(holdings.filter(h=>Math.abs(h.diff)>=5).length>0?[{type:"warn",title:`5%p 이상 이탈: ${holdings.filter(h=>Math.abs(h.diff)>=5).length}개`,body:holdings.filter(h=>Math.abs(h.diff)>=5).map(h=>`${h.etf} ${fmtP(h.diff)}`).join(" / ")}]:[]),
  ];

  const tabs=["① 실행 시점 판단","② 판단 근거","③ 실행 지시"];
  const doneCount=Object.values(checked).filter(Boolean).length;
  const totalActions=sells.length+buys.length;

  return(
    <div>
      {/* 헤더 요약 */}
      <Card style={{marginBottom:"1.25rem"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:"1rem"}}>
          <div>
            <div style={{fontSize:15,fontWeight:500,marginBottom:4}}>리밸런싱 판단 센터</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              <Badge c="#27500a" bg="#eaf3de">{getStrat(portfolio.strategy).name}</Badge>
              <Badge c={isOverdue?"#791f1f":"var(--color-text-secondary)"} bg={isOverdue?"#fcebeb":"var(--color-background-secondary)"}>{elapsed}일 경과</Badge>
              <Badge c="var(--color-text-secondary)" bg="var(--color-background-secondary)">{portfolio.accountType}</Badge>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:2}}>마지막 리밸런싱</div>
            <div style={{fontSize:13,fontWeight:500}}>{portfolio.lastRebalDate}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
          <MetaCard label="총 평가금액" value={fmt(total)+"원"}/>
          <MetaCard label="VIX" value={vix.toFixed(1)} sub={z.lbl} subColor={z.color}/>
          <MetaCard label="MDD" value={portfolio.mdd.toFixed(1)+"%"} sub={"제한 "+portfolio.mddLimit+"%"} subColor={portfolio.mdd<portfolio.mddLimit?"#a32d2d":"#3b6d11"}/>
          <MetaCard label="IRP 위험자산" value={irpRisk+"%"} sub={portfolio.accountType==="IRP"?"한도 70%":"-"} subColor={irpRisk>70?"#a32d2d":"#3b6d11"}/>
        </div>
      </Card>

      {/* 탭 */}
      <div style={{display:"flex",gap:2,borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:"1.25rem"}}>
        {tabs.map((t,i)=>(
          <button key={i} onClick={()=>setStep(i)} style={{padding:"8px 16px",fontSize:13,border:"none",background:"none",cursor:"pointer",color:step===i?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:`2px solid ${step===i?"var(--color-text-primary)":"transparent"}`,fontWeight:step===i?500:400,fontFamily:"var(--font-sans)",marginBottom:-1}}>
            {t}
          </button>
        ))}
      </div>

      {step===0&&(
        <div>
          <Card accent={isOverdue?"#a32d2d":isTime?"#ba7517":undefined}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:isOverdue?"#fcebeb":isTime?"#faeeda":"#eaf3de",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <div style={{fontSize:16,fontWeight:500,color:isOverdue?"#a32d2d":isTime?"#ba7517":"#3b6d11"}}>{elapsed}일</div>
                <div style={{fontSize:9,color:isOverdue?"#a32d2d":isTime?"#ba7517":"#3b6d11"}}>경과</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,color:isOverdue?"#a32d2d":isTime?"#ba7517":"var(--color-text-primary)",marginBottom:4}}>
                  {isOverdue?"리밸런싱 기준일 도달 — 즉시 실행 권장":isTime?"리밸런싱 시점 도달":"리밸런싱 예정 — "+`${required-elapsed}일 후`}
                </div>
                <div style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.7}}>마지막: {portfolio.lastRebalDate} · 주기: {portfolio.rebalPeriod}({required}일)</div>
              </div>
              <div style={{background:isOverdue?"#fcebeb":isTime?"#faeeda":"#eaf3de",borderRadius:8,padding:".75rem 1rem",textAlign:"center",minWidth:80}}>
                <div style={{fontSize:10,color:isOverdue?"#791f1f":isTime?"#633806":"#27500a"}}>진행률</div>
                <div style={{fontSize:20,fontWeight:500,color:isOverdue?"#a32d2d":isTime?"#ba7517":"#3b6d11"}}>{Math.min(Math.round(elapsed/required*100),100)}%</div>
              </div>
            </div>
            <div style={{height:6,background:"var(--color-background-secondary)",borderRadius:3,overflow:"hidden",margin:"1rem 0 3px"}}>
              <div style={{height:"100%",width:`${Math.min(elapsed/required*100,100)}%`,background:isOverdue?"#a32d2d":isTime?"#ba7517":"#3b6d11",borderRadius:3}}/>
            </div>
          </Card>
          <Card><ST>VIX 시장 신호</ST><VixBar vix={vix}/><div style={{background:z.bg,borderRadius:8,padding:".875rem 1rem",marginTop:10}}><Badge c={z.color} bg={z.color+"20"}>{z.mode}</Badge><span style={{fontSize:12,color:z.color,marginLeft:8}}>{z.desc}</span></div></Card>
          <Card>
            <ST>현재 비중 편차</ST>
            {holdings.map((h,i)=><AllocBar key={i} label={h.etf} pct={h.cur} target={h.target} color={ASSET_COLORS[h.cls]||"#888"}/>)}
          </Card>
          <div style={{display:"flex",justifyContent:"flex-end"}}><Btn primary onClick={()=>setStep(1)}>판단 근거 확인 →</Btn></div>
        </div>
      )}

      {step===1&&(
        <div>
          <Card>
            <ST>종합 판단</ST>
            <div style={{background:isOverdue||portfolio.mdd<portfolio.mddLimit?"#fcebeb":"#eaf3de",border:`0.5px solid ${isOverdue?"#f09595":"#c0dd97"}`,borderRadius:10,padding:"1.25rem",marginBottom:"1.25rem"}}>
              <div style={{fontSize:14,fontWeight:500,color:isOverdue||portfolio.mdd<portfolio.mddLimit?"#791f1f":"#27500a",marginBottom:5}}>
                {portfolio.mdd<portfolio.mddLimit?"리밸런싱 실행 — MDD 제한선 초과. 방어 자산 우선.":isOverdue?"리밸런싱 실행 — 주기 도달. 전략 기준대로 조정하세요.":isTime?"리밸런싱 실행 — 시점 도달. VIX 신호 참고해 집행하세요.":"리밸런싱 불필요 — 기준일까지 유지하세요."}
              </div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.7}}>{vix>35?"공황 구간 — 분할 집행(3~5회) 권장.":vix>25?"불안 구간 — 2~3회 분할 매수 권장.":"정상 구간 — 전략 기준대로 일괄 집행 가능."}</div>
            </div>
            {reasons.map((r,i)=><ReasonBox key={i} {...r}/>)}
          </Card>
          <Card>
            <ST>자산별 판단</ST>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{["ETF","현재","목표","편차","수익률","판단"].map(h=><th key={h} style={{textAlign:"left",padding:"5px 8px",fontSize:11,color:"var(--color-text-secondary)",fontWeight:600}}>{h}</th>)}</tr></thead>
              <tbody>{holdings.map((h,i)=>{
                const isSL=h.pnlPct!==null&&h.pnlPct<portfolio.stopLoss;
                const act=isSL?"손절 우선":h.actionAmt>5000?"매도":h.actionAmt<-5000?"매수":"유지";
                const aC=isSL?"#791f1f":act==="매도"?"#a32d2d":act==="매수"?"#0c447c":"#27500a";
                const aBg=isSL?"#fcebeb":act==="매도"?"#fcebeb":act==="매수"?"#e6f1fb":"#eaf3de";
                return(
                  <tr key={i} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                    <td style={{padding:"7px 8px"}}><div style={{fontWeight:500}}>{h.etf.replace(" (H)","")}</div><div style={{fontSize:10,color:"var(--color-text-secondary)"}}>{h.code}</div></td>
                    <td style={{padding:"7px 8px",fontWeight:500}}>{h.cur}%</td>
                    <td style={{padding:"7px 8px",color:"var(--color-text-secondary)"}}>{h.target}%</td>
                    <td style={{padding:"7px 8px",fontWeight:600,color:Math.abs(h.diff)>=5?(h.diff>0?"#a32d2d":"#0c447c"):"#27500a"}}>{fmtP(h.diff)}</td>
                    <td style={{padding:"7px 8px",color:h.pnlPct===null?"var(--color-text-secondary)":h.pnlPct<0?"#a32d2d":"#3b6d11",fontWeight:500}}>{h.pnlPct!=null?fmtP(h.pnlPct):"—"}</td>
                    <td style={{padding:"7px 8px"}}><Badge c={aC} bg={aBg}>{act}</Badge></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </Card>
          <div style={{display:"flex",justifyContent:"space-between"}}><Btn onClick={()=>setStep(0)}>← 시점 판단</Btn><Btn primary onClick={()=>setStep(2)}>실행 지시 확인 →</Btn></div>
        </div>
      )}

      {step===2&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:"1rem"}}>
            <div style={{background:"#fcebeb",borderRadius:8,padding:".875rem",textAlign:"center"}}><div style={{fontSize:11,color:"#791f1f",fontWeight:600,marginBottom:4}}>매도</div><div style={{fontSize:20,fontWeight:500,color:"#a32d2d"}}>{sells.length}건</div><div style={{fontSize:11,color:"#a32d2d",marginTop:2}}>{fmt(sells.reduce((s,h)=>s+h.actionAmt,0))}원</div></div>
            <div style={{background:"#e6f1fb",borderRadius:8,padding:".875rem",textAlign:"center"}}><div style={{fontSize:11,color:"#0c447c",fontWeight:600,marginBottom:4}}>매수</div><div style={{fontSize:20,fontWeight:500,color:"#185fa5"}}>{buys.length}건</div><div style={{fontSize:11,color:"#0c447c",marginTop:2}}>{fmt(Math.abs(buys.reduce((s,h)=>s+h.actionAmt,0)))}원</div></div>
            <div style={{background:"#eaf3de",borderRadius:8,padding:".875rem",textAlign:"center"}}><div style={{fontSize:11,color:"#27500a",fontWeight:600,marginBottom:4}}>유지</div><div style={{fontSize:20,fontWeight:500,color:"#3b6d11"}}>{holds.length}건</div></div>
          </div>
          {sells.length>0&&<Card>
            <div style={{fontSize:11,fontWeight:500,color:"#791f1f",marginBottom:".75rem"}}>매도 — 비중 초과 자산</div>
            {sells.map((h,i)=>{const key=`s${i}`;return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<sells.length-1?"0.5px solid var(--color-border-tertiary)":"none",opacity:checked[key]?.5:1}}>
                <input type="checkbox" checked={!!checked[key]} onChange={e=>setChecked(p=>({...p,[key]:e.target.checked}))} style={{width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:500,textDecoration:checked[key]?"line-through":"none"}}>{h.etf}</span><span style={{fontFamily:"monospace",fontSize:10,background:"var(--color-background-secondary)",padding:"1px 5px",borderRadius:3,color:"var(--color-text-secondary)"}}>{h.code}</span><Badge c="#791f1f" bg="#fcebeb">매도</Badge></div>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.6}}>현재 {h.cur}% → 목표 {h.target}% · 현재 {fmt(h.amt)}원 → 목표 {fmt(h.targetAmt)}원</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:16,fontWeight:500,color:"#a32d2d"}}>-{fmt(h.actionAmt)}원</div></div>
              </div>
            );})}
          </Card>}
          {buys.length>0&&<Card>
            <div style={{fontSize:11,fontWeight:500,color:"#0c447c",marginBottom:".75rem"}}>매수 — 비중 부족 자산</div>
            {vix>25&&<div style={{background:"#faeeda",borderRadius:8,padding:".75rem 1rem",fontSize:12,color:"#633806",marginBottom:"1rem"}}>VIX {vix.toFixed(1)} 불안 구간 — {vix>35?"3~5회":"2~3회"} 분할 매수 권장</div>}
            {buys.map((h,i)=>{const key=`b${i}`;const sp=vix>35?5:vix>25?3:1;return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<buys.length-1?"0.5px solid var(--color-border-tertiary)":"none",opacity:checked[key]?.5:1}}>
                <input type="checkbox" checked={!!checked[key]} onChange={e=>setChecked(p=>({...p,[key]:e.target.checked}))} style={{width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:500,textDecoration:checked[key]?"line-through":"none"}}>{h.etf}</span><span style={{fontFamily:"monospace",fontSize:10,background:"var(--color-background-secondary)",padding:"1px 5px",borderRadius:3,color:"var(--color-text-secondary)"}}>{h.code}</span><Badge c="#0c447c" bg="#e6f1fb">매수</Badge>{sp>1&&<Badge c="#633806" bg="#faeeda">{sp}회 분할</Badge>}</div>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.6}}>현재 {h.cur}% → 목표 {h.target}% · 현재 {fmt(h.amt)}원 → 목표 {fmt(h.targetAmt)}원{sp>1?` · 1회당 약 ${fmt(Math.round(Math.abs(h.actionAmt)/sp/10000)*10000)}원`:""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:16,fontWeight:500,color:"#185fa5"}}>+{fmt(Math.abs(h.actionAmt))}원</div></div>
              </div>
            );})}
          </Card>}
          {holds.length>0&&<Card><div style={{fontSize:11,fontWeight:500,color:"#27500a",marginBottom:".75rem"}}>유지</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{holds.map((h,i)=><div key={i} style={{background:"#eaf3de",borderRadius:8,padding:".625rem .875rem",fontSize:12}}><span style={{fontWeight:500,color:"#27500a"}}>{h.etf.replace(" (H)","")}</span><span style={{color:"#3b6d11",marginLeft:8}}>{h.cur}%</span></div>)}</div></Card>}
          <Card accent={doneCount===totalActions&&totalActions>0?"#3b6d11":undefined}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div><div style={{fontSize:13,fontWeight:500,marginBottom:3}}>실행 완료 체크</div><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{doneCount} / {totalActions} 완료{doneCount===totalActions&&totalActions>0?" — 모든 주문 완료!":""}</div></div>
              {doneCount===totalActions&&totalActions>0&&<div style={{background:"#eaf3de",borderRadius:8,padding:".75rem 1rem",fontSize:12,color:"#27500a",fontWeight:500}}>다음 리밸런싱 예정일: {new Date(Date.now()+required*86400000).toLocaleDateString("ko-KR")}</div>}
            </div>
          </Card>
          <div style={{display:"flex",justifyContent:"flex-start"}}><Btn onClick={()=>setStep(1)}>← 판단 근거</Btn></div>
        </div>
      )}
    </div>
  );
}

// ─── 4-4. 은퇴 로드맵 ──────────────────────────────────────────────────────
function RetirementRoadmap({strategyId}){
  const [cAge,setCAge]=useState(40);
  const [rAge,setRAge]=useState(60);
  const [life,setLife]=useState(90);
  const [bal,setBal]=useState(54320000);
  const [contrib,setContrib]=useState(500000);
  const [need,setNeed]=useState(3000000);
  const [pension,setPension]=useState(1000000);
  const [strat,setStrat]=useState(strategyId||"allseason");

  const s=STRATEGIES.find(x=>x.id===strat)||STRATEGIES[3];
  const sr=s.annualRet||{cons:0.06,base:0.085,opt:0.105};
  const yrs=Math.max(rAge-cAge,1), ryrs=Math.max(life-rAge,1);
  const INF=0.03;
  const futureNeed=need*Math.pow(1+INF,yrs);
  const netNeed=Math.max(futureNeed-pension,0);
  const WR=0.03/12;
  const target=netNeed>0?netNeed*(1-Math.pow(1+WR,-(ryrs*12)))/WR:0;

  const simC=useMemo(()=>simulate(bal,contrib,sr.cons,yrs),[bal,contrib,sr.cons,yrs]);
  const simB=useMemo(()=>simulate(bal,contrib,sr.base,yrs),[bal,contrib,sr.base,yrs]);
  const simO=useMemo(()=>simulate(bal,contrib,sr.opt, yrs),[bal,contrib,sr.opt, yrs]);
  const bC=simC[simC.length-1].b, bB=simB[simB.length-1].b, bO=simO[simO.length-1].b;
  const ok=bB>=target;
  const wdCheck=useMemo(()=>checkWithdraw(bB,netNeed,0.03,ryrs),[bB,netNeed,ryrs]);
  const nc=useMemo(()=>calcNeededContrib(target,sr.base,yrs,bal),[target,sr.base,yrs,bal]);
  const extAge=useMemo(()=>{for(let a=rAge;a<=70;a++){const y=a-cAge;if(y<1)continue;const t=simulate(bal,contrib,sr.base,y);if(t[t.length-1].b>=target)return a;}return 70;},[rAge,cAge,bal,contrib,sr.base,target]);

  // SVG 차트
  const CW=520,CH=180,PAD=48;
  const maxV=Math.max(bO,target)*1.12;
  const tx=yr=>(yr/yrs)*(CW-PAD-8)+PAD;
  const ty=v=>CH-14-(v/maxV)*(CH-30);
  const lp=sim=>sim.map((p,i)=>`${i?"L":"M"}${tx(p.y).toFixed(1)},${ty(p.b).toFixed(1)}`).join(" ");
  const ap=sim=>{const l=sim.map((p,i)=>`${i?"L":"M"}${tx(p.y).toFixed(1)},${ty(p.b).toFixed(1)}`).join(" ");return`${l} L${tx(yrs)},${CH-14} L${tx(0)},${CH-14} Z`;};
  const tgY=ty(target);

  const SL=(label,val,set,min,max,step,extra)=>(
    <div style={{marginBottom:"1rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{label}</span><span style={{fontSize:13,fontWeight:500}}>{fmt(val)}원</span></div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e=>set(Number(e.target.value))} style={{width:"100%"}}/>
      {extra&&<div style={{fontSize:10,color:"var(--color-text-secondary)",marginTop:3}}>{extra}</div>}
    </div>
  );
  const SLA=(label,val,set,min,max,step,unit)=>(
    <div style={{marginBottom:"1rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{label}</span><span style={{fontSize:13,fontWeight:500}}>{val}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={e=>set(Number(e.target.value))} style={{width:"100%"}}/>
    </div>
  );

  const SCN=[{k:"보수",r:sr.cons,b:bC,c:"#888780",bg:"var(--color-background-secondary)"},{k:"기본",r:sr.base,b:bB,c:"#185fa5",bg:"#e6f1fb"},{k:"낙관",r:sr.opt,b:bO,c:"#3b6d11",bg:"#eaf3de"}];

  return(
    <div style={{display:"grid",gridTemplateColumns:"255px 1fr",gap:"1rem",alignItems:"start"}}>
      {/* 입력 */}
      <div>
        <Card>
          <ST>기본 정보</ST>
          {SLA("현재 나이",cAge,setCAge,25,65,1,"세")}
          {SLA("은퇴 목표 나이",rAge,v=>{if(v>cAge)setRAge(v)},cAge+1,75,1,"세")}
          {SLA("기대 수명",life,setLife,rAge+5,100,1,"세")}
        </Card>
        <Card>
          <ST>연금 자산</ST>
          {SL("현재 잔고",bal,setBal,0,200000000,1000000)}
          {SL("월 납입액",contrib,setContrib,0,3000000,100000,`연 ${fmt(Math.min(contrib*12,9000000))}원 세액공제 → 환급 약 ${fmt(Math.round(Math.min(contrib*12,9000000)*0.165/10000)*10000)}원`)}
        </Card>
        <Card>
          <ST>은퇴 후 생활비</ST>
          {SL("월 생활비 (현재 기준)",need,setNeed,500000,8000000,100000,`은퇴 시점 약 ${fmt(futureNeed)}원/월`)}
          {SL("국민연금 등 수령액",pension,setPension,0,3000000,100000,`순 필요 인출: ${fmt(netNeed)}원/월`)}
        </Card>
        <Card>
          <ST>투자 전략</ST>
          <select value={strat} onChange={e=>setStrat(e.target.value)} style={{width:"100%",padding:"7px 10px",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",fontSize:12,background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}>
            {STRATEGIES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginTop:"1rem"}}>
            {SCN.map(s=><div key={s.k} style={{background:s.bg,borderRadius:6,padding:".5rem",textAlign:"center"}}><div style={{fontSize:10,color:s.c,fontWeight:600}}>{s.k}</div><div style={{fontSize:13,fontWeight:500,color:s.c}}>{fmtR(s.r)}</div></div>)}
          </div>
        </Card>
      </div>

      {/* 결과 */}
      <div>
        <Card accent={ok?"#3b6d11":"#a32d2d"}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>필요 은퇴 자산 (목표)</div>
              <div style={{fontSize:26,fontWeight:500,marginBottom:4}}>{fmt(target)}원</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.6}}>은퇴 후 {ryrs}년 × 순 생활비 {fmt(netNeed)}원/월 (물가 {fmtR(INF)}/년 · 연금 차감)</div>
            </div>
            <div style={{background:ok?"#eaf3de":"#fcebeb",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",textAlign:"center",minWidth:120}}>
              <div style={{fontSize:11,color:ok?"#27500a":"#791f1f",fontWeight:600,marginBottom:4}}>{ok?"목표 달성 가능":"목표 미달"}</div>
              <div style={{fontSize:22,fontWeight:500,color:ok?"#3b6d11":"#a32d2d"}}>{ok?"+":"-"}{fmt(Math.abs(bB-target))}</div>
              <div style={{fontSize:10,color:ok?"#27500a":"#791f1f",marginTop:3}}>기본 시나리오 기준</div>
            </div>
          </div>
          <div style={{marginTop:"1rem",padding:".875rem",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>
            {wdCheck.ok?<div style={{fontSize:12,color:"#27500a",lineHeight:1.6}}>기본 시나리오: 은퇴 후 {ryrs}년({life}세)까지 자산 유지. 잔여 <strong>{fmt(wdCheck.rem)}원</strong></div>:<div style={{fontSize:12,color:"#a32d2d",lineHeight:1.6}}>기본 시나리오: 은퇴 후 약 <strong>{wdCheck.yr}년</strong> 후 자산 소진 예상. 납입 증액 또는 생활비 절감 필요.</div>}
          </div>
        </Card>

        <Card>
          <ST>시나리오별 예상 잔고 ({rAge}세 시점)</ST>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:"1.25rem"}}>
            {SCN.map(s=><div key={s.k} style={{background:s.bg,borderRadius:"var(--border-radius-md)",padding:"1rem",border:`0.5px solid ${s.c}40`}}><div style={{fontSize:10,color:s.c,fontWeight:600,marginBottom:3}}>{s.k} ({fmtR(s.r)}/년)</div><div style={{fontSize:18,fontWeight:500,color:s.c,marginBottom:3}}>{fmt(s.b)}</div><div style={{fontSize:11,color:s.b>=target?"#27500a":"#a32d2d",fontWeight:500}}>목표 대비 {s.b>=target?"+":""}{fmt(s.b-target)}</div></div>)}
          </div>
          <div style={{overflowX:"auto"}}>
            <svg viewBox={`0 0 ${CW} ${CH+22}`} width="100%" style={{display:"block"}}>
              {[0,.25,.5,.75,1].map((t,i)=>{const v=maxV*t,y=ty(v);return(<g key={i}><line x1={PAD} y1={y} x2={CW-8} y2={y} stroke="rgba(128,128,128,0.1)" strokeWidth={1}/><text x={PAD-4} y={y+4} textAnchor="end" fontSize={8} fill="var(--color-text-secondary)">{fmt(v)}</text></g>);})}
              {[0,.25,.5,.75,1].map((t,i)=>{const yr=Math.round(t*yrs);return<text key={i} x={tx(yr)} y={CH+13} textAnchor="middle" fontSize={8} fill="var(--color-text-secondary)">{cAge+yr}세</text>;})}
              <line x1={PAD} y1={tgY} x2={CW-8} y2={tgY} stroke="#a32d2d" strokeWidth={1.5} strokeDasharray="5,3"/>
              <text x={CW-10} y={tgY-4} textAnchor="end" fontSize={8} fill="#a32d2d">목표 {fmt(target)}</text>
              <path d={ap(simC)} fill="#88878015"/>
              <path d={lp(simC)} fill="none" stroke="#888780" strokeWidth={1.5} strokeDasharray="4,3"/>
              <path d={lp(simB)} fill="none" stroke="#185fa5" strokeWidth={2.5}/>
              <path d={lp(simO)} fill="none" stroke="#3b6d11" strokeWidth={1.5} strokeDasharray="4,3"/>
              {[["보수","#888780","4,3"],["기본","#185fa5",""],["낙관","#3b6d11","4,3"],["목표","#a32d2d","5,3"]].map(([l,c,d],i)=>(
                <g key={l} transform={`translate(${PAD+i*85},${CH+21})`}><line x1={0} y1={0} x2={14} y2={0} stroke={c} strokeWidth={l==="기본"?2.5:1.5} strokeDasharray={d}/><text x={18} y={4} fontSize={8} fill="var(--color-text-secondary)">{l}</text></g>
              ))}
            </svg>
          </div>
        </Card>

        {!ok&&<Card>
          <ST>목표 달성을 위한 조정 방안</ST>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:"#e6f1fb",borderRadius:"var(--border-radius-md)",padding:"1rem",borderLeft:"3px solid #185fa5"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:"#0c447c"}}>방안 ① — 월 납입액 증액</div><div style={{fontSize:16,fontWeight:500,color:"#185fa5"}}>{fmt(nc)}원/월</div></div>
              <div style={{fontSize:11,color:"#0c447c",lineHeight:1.6}}>현재 {fmt(contrib)}원 → <strong>{fmt(nc)}원/월</strong>으로 증액 시 목표 달성. 증액분: {fmt(nc-contrib)}원/월</div>
            </div>
            <div style={{background:"#faeeda",borderRadius:"var(--border-radius-md)",padding:"1rem",borderLeft:"3px solid #ba7517"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:"#633806"}}>방안 ② — 은퇴 시점 연장</div><div style={{fontSize:16,fontWeight:500,color:"#ba7517"}}>{extAge}세 은퇴</div></div>
              <div style={{fontSize:11,color:"#633806",lineHeight:1.6}}>현재 납입 유지 시 <strong>{extAge}세</strong>에 목표 달성 ({extAge>rAge?extAge-rAge+"년 연장":"이미 달성"}).</div>
            </div>
            <div style={{background:"#eaf3de",borderRadius:"var(--border-radius-md)",padding:"1rem",borderLeft:"3px solid #3b6d11"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:"#27500a"}}>방안 ③ — 현실 목표 재설정</div><div style={{fontSize:16,fontWeight:500,color:"#3b6d11"}}>{fmt(Math.round(bB/ryrs/12/1000)*1000)}원/월</div></div>
              <div style={{fontSize:11,color:"#27500a",lineHeight:1.6}}>현재 납입 유지 시 {fmt(bB)}원 기준 인출 가능. 연금 포함 <strong>{fmt(Math.round(bB/ryrs/12/1000)*1000+pension)}원/월</strong>.</div>
            </div>
          </div>
        </Card>}

        {ok&&<Card>
          <ST>목표 초과 달성 — 여유 자산 활용</ST>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:"#eaf3de",borderRadius:8,padding:".875rem 1rem",fontSize:12,color:"#27500a",lineHeight:1.7}}>기본 시나리오에서 목표 대비 <strong>{fmt(bB-target)}원</strong> 초과 예상.</div>
            <div style={{background:"#e6f1fb",borderRadius:8,padding:".875rem 1rem",fontSize:12,color:"#0c447c",lineHeight:1.7}}>초과분 보수 운용(연 3%) 시 추가 <strong>{fmt(Math.round((bB-target)*0.03/12/1000)*1000)}원/월</strong> 인출 가능.</div>
          </div>
        </Card>}

        <Card style={{marginBottom:0}}>
          <ST>연간 세액공제 현황 (IRP+연금저축 합산)</ST>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {[["연 납입액",`${fmt(contrib*12)}원`,null],["세액공제 한도","900만원",null],["환급 예상",`${fmt(Math.round(Math.min(contrib*12,9000000)*0.165/10000)*10000)}원`,contrib*12>=9000000?"한도 최대 활용 ✓":"납입 확대 검토"]].map(([l,v,s2])=>(
              <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:".875rem",textAlign:"center"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{l}</div><div style={{fontSize:15,fontWeight:500}}>{v}</div>{s2&&<div style={{fontSize:10,color:contrib*12>=9000000?"#27500a":"#ba7517",marginTop:2,fontWeight:500}}>{s2}</div>}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// SheetSetup 컴포넌트 삭제됨 (AuthSetup으로 대체)

// ─── 4-6. 월간 리포트 ───────────────────────────────────────────────────────
function MonthlyReport({portfolio,vix,strategy}){
  const s=getStrat(portfolio.strategy);
  const now=new Date();
  const month=`${now.getFullYear()}년 ${String(now.getMonth()+1).padStart(2,"0")}월`;
  const total=portfolio.total;
  const holdings=portfolio.holdings.map(h=>({...h,cur:Math.round(h.amt/total*1000)/10}));
  const momentumMode = portfolio.momentumMode || "";
  const momentumUpdatedAt = portfolio.momentumUpdatedAt || "";

  function print(){
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${month} 포트폴리오 리포트</title>
    <style>body{font-family:sans-serif;font-size:13px;line-height:1.8;padding:30px;max-width:720px;margin:0 auto;color:#222}
    h2{font-size:17px;margin-bottom:4px}h3{font-size:14px;margin:20px 0 8px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
    th{text-align:left;padding:5px 8px;border-bottom:1.5px solid #ddd;font-weight:600;color:#555}
    td{padding:5px 8px;border-bottom:0.5px solid #eee}
    .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:12px;font-weight:600}
    hr{border:0;border-top:1px solid #eee;margin:20px 0}
    @media print{body{padding:15px}}</style></head><body>
    <h2>${month} 월간 포트폴리오 리포트</h2>
    <p style="color:#888;font-size:11px">생성일: ${now.toLocaleString("ko-KR")} | 연금 포트폴리오 파일럿 v4.0</p>
    <hr>
    <h3>1. 포트폴리오 현황</h3>
    <p>총 평가금액: <strong>${fmt(total)}원</strong><br>선택 전략: <strong>${s.name}</strong> (${s.type==="fixed"?"고정비중":"모멘텀"})<br>리밸런싱 주기: ${s.rebal}<br>마지막 리밸런싱: ${portfolio.lastRebalDate}<br>MDD: ${portfolio.mdd.toFixed(1)}% (제한선 ${portfolio.mddLimit}%)</p>
    <h3>2. 시장 상황</h3>
    <p>VIX: <strong>${vix.toFixed(1)}</strong> (${getZone(vix).lbl} / ${getZone(vix).mode})<br>${getZone(vix).desc}</p>
    <h3>3. 자산군별 현황 및 목표 편차</h3>
    <table><thead><tr><th>ETF명</th><th>코드</th><th>현재%</th><th>목표%</th><th>편차</th><th>평가금액</th><th>수익률</th></tr></thead>
    <tbody>${holdings.map(h=>{const diff=h.cur-h.target,pnl=h.costAmt>0?((h.amt-h.costAmt)/h.costAmt*100).toFixed(1):"-";return`<tr><td>${h.etf}</td><td>${h.code}</td><td>${h.cur}%</td><td>${h.target}%</td><td style="color:${Math.abs(diff)>=5?(diff>0?"#c00":"#00c"):"#090"}">${diff>=0?"+":""}${diff.toFixed(1)}%p</td><td>${fmt(h.amt)}원</td><td style="color:${pnl!=="-"&&parseFloat(pnl)<0?"#c00":"#090"}">${pnl!=="-"?pnl+"%":"-"}</td></tr>`;}).join("")}</tbody></table>
    <h3>4. IRP 적합성</h3>
    <p>계좌 유형: <strong>${portfolio.accountType}</strong><br>위험자산 비중: <strong>${holdings.filter(h=>["미국주식","선진국주식","신흥국주식","국내주식","금","원자재","부동산리츠"].includes(h.cls)).reduce((s,h)=>s+h.cur,0).toFixed(1)}%</strong> (IRP 한도 70%)</p>
    <h3>5. 데이터/계산 출처</h3>
     <p>포트폴리오/비중(JSON): Google Apps Script 'Code_v3.gs'의 'doGet()' 결과<br>VIX: 서버리스 '/api/vix' (Stooq 무료 CSV 기반)<br>모멘텀 목표 비중: 서버리스 '/api/momentum' (mode: ${momentumMode || "n/a"} · 갱신: ${momentumUpdatedAt || "n/a"})</p>
    <h3>6. AI 컨설팅 질의 가이드</h3>
    <p>이 리포트를 ChatGPT · Gemini · Claude에 첨부한 뒤 아래 질문을 입력하세요:</p>
    <ul style="font-size:12px;line-height:2"><li>현재 포트폴리오의 리스크를 분석하고 리밸런싱 우선순위를 알려주세요.</li><li>선택 전략(${s.name}) 대비 편차가 큰 자산부터 조정 금액을 계산해주세요.</li><li>현재 VIX ${vix.toFixed(1)} 수준에서 이 포트폴리오의 적정성을 평가해주세요.</li><li>손절 기준에 근접한 자산이 있다면 대안 자산군을 추천해주세요.</li></ul>
    <hr><p style="font-size:11px;color:#888">본 리포트는 투자 참고용이며 투자 결과에 대한 책임은 투자자 본인에게 있습니다.</p>
    </body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),600);
  }

  return(
    <div>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:"1rem"}}>
          <div>
            <div style={{fontSize:14,fontWeight:500,marginBottom:3}}>{month} 월간 포트폴리오 리포트</div>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>AI 컨설팅용 구조화 리포트 — PDF로 저장 후 ChatGPT · Gemini · Claude에 첨부</div>
          </div>
          <Btn danger onClick={print}>PDF 출력</Btn>
        </div>
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"1.25rem",fontSize:12,lineHeight:1.9}}>
          <div style={{fontSize:15,fontWeight:500,marginBottom:".5rem"}}>{month} 월간 포트폴리오 리포트</div>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:"1rem"}}>생성일: {now.toLocaleString("ko-KR")} | 연금 포트폴리오 파일럿 v4.0</div>
          <div style={{fontWeight:500,marginBottom:5,fontSize:13}}>1. 포트폴리오 현황</div>
          <div style={{color:"var(--color-text-secondary)",marginBottom:"1rem"}}>총 평가금액: <strong style={{color:"var(--color-text-primary)"}}>{fmt(total)}원</strong> · 선택 전략: <strong style={{color:"var(--color-text-primary)"}}>{s.name}</strong> · MDD: {portfolio.mdd.toFixed(1)}%</div>
          <div style={{fontWeight:500,marginBottom:5,fontSize:13}}>2. 자산군별 현황</div>
          <div style={{color:"var(--color-text-secondary)",marginBottom:"1rem"}}>{holdings.map(h=>`${h.etf}: ${h.cur}% (목표 ${h.target}%, 편차 ${h.cur-h.target>=0?"+":""}${(h.cur-h.target).toFixed(1)}%p)`).join(" / ")}</div>
          <div style={{fontWeight:500,marginBottom:5,fontSize:13}}>3. AI 컨설팅 질의 가이드</div>
          <div style={{color:"var(--color-text-secondary)",lineHeight:1.8}}>
            이 리포트를 AI에 첨부한 뒤:<br/>
            · "현재 포트폴리오 리스크 분석 및 리밸런싱 우선순위"<br/>
            · "전략 대비 편차 큰 자산부터 조정 금액 계산"<br/>
            · "VIX {vix.toFixed(1)} 수준에서 포트폴리오 적정성 평가"
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── 4-7. 비중 비교 ─────────────────────────────────────────────────────────
function CompareWeights({portfolio}){
  const [benchKey,setBenchKey]=useState(portfolio.strategy||"allseason");
  const total=portfolio.total;
  const bench=STRATEGIES.find(s=>s.id===benchKey)||STRATEGIES[3];
  const benchMap=Object.fromEntries((bench.etfs||[]).filter(e=>e.w!=null).map(e=>[e.cls,e.w]));

  const holdings=portfolio.holdings.map(h=>{
    const cur=Math.round(h.amt/total*1000)/10;
    const bm=benchMap[h.cls]||0;
    const diff=Math.round((cur-bm)*10)/10;
    const targetAmt=Math.round(total*bm/100);
    const actionAmt=Math.round((h.amt-targetAmt)/10000)*10000;
    return{...h,cur,bm,diff,targetAmt,actionAmt};
  });

  const allCls=[...new Set([...holdings.map(h=>h.cls),...Object.keys(benchMap)])];
  const sells=holdings.filter(h=>h.actionAmt>5000).sort((a,b)=>b.actionAmt-a.actionAmt);
  const buys=holdings.filter(h=>h.actionAmt<-5000).sort((a,b)=>a.actionAmt-b.actionAmt);

  return(
    <div>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".875rem",flexWrap:"wrap",gap:8}}>
          <ST>벤치마크 전략 선택</ST>
          <select value={benchKey} onChange={e=>setBenchKey(e.target.value)}
            style={{padding:"6px 10px",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",fontSize:12,background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}>
            {STRATEGIES.filter(s=>s.type==="fixed").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:12,fontSize:11,color:"var(--color-text-secondary)",marginBottom:"1rem"}}>
          <span><span style={{display:"inline-block",width:10,height:4,background:"var(--color-text-primary)",opacity:.3,marginRight:4,verticalAlign:"middle"}}/>벤치마크 목표</span>
        </div>
        {allCls.map((cls,i)=>{
          const h=holdings.find(x=>x.cls===cls);
          const cur=h?h.cur:0;
          const bm=benchMap[cls]||0;
          const diff=Math.round((cur-bm)*10)/10;
          const dc=Math.abs(diff)>=5?(diff>0?"#a32d2d":"#0c447c"):"#27500a";
          return(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
              <div style={{fontSize:11,minWidth:120,color:"var(--color-text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls}</div>
              <div style={{flex:1,height:7,background:"var(--color-background-secondary)",borderRadius:4,overflow:"hidden",position:"relative",minWidth:60}}>
                <div style={{height:"100%",width:`${Math.min(cur,100)}%`,background:ASSET_COLORS[cls]||"#888",borderRadius:4}}/>
                {bm>0&&<div style={{position:"absolute",top:0,left:`${Math.min(bm,100)}%`,width:2,height:"100%",background:"var(--color-text-primary)",opacity:.35}}/>}
              </div>
              <span style={{fontSize:11,fontWeight:500,minWidth:30,textAlign:"right"}}>{cur.toFixed(1)}%</span>
              <span style={{fontSize:11,fontWeight:500,minWidth:44,textAlign:"right",color:dc}}>{diff>=0?"+":""}{diff.toFixed(1)}%p</span>
            </div>
          );
        })}
      </Card>

      {(sells.length>0||buys.length>0)&&(
        <Card>
          <ST>리밸런싱 조정 금액 (5%p 이상 이탈)</ST>
          {sells.map((h,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12}}>
              <div><span style={{fontWeight:500}}>{h.etf}</span><span style={{fontSize:10,color:"var(--color-text-secondary)",marginLeft:6}}>{h.cls}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:"var(--color-text-secondary)"}}>{h.cur.toFixed(1)}% → {h.bm.toFixed(1)}%</span>
                <Badge c="#791f1f" bg="#fcebeb">매도 {fmt(h.actionAmt)}원</Badge>
              </div>
            </div>
          ))}
          {buys.map((h,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12}}>
              <div><span style={{fontWeight:500}}>{h.etf}</span><span style={{fontSize:10,color:"var(--color-text-secondary)",marginLeft:6}}>{h.cls}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:"var(--color-text-secondary)"}}>{h.cur.toFixed(1)}% → {h.bm.toFixed(1)}%</span>
                <Badge c="#0c447c" bg="#e6f1fb">매수 {fmt(Math.abs(h.actionAmt))}원</Badge>
              </div>
            </div>
          ))}
          <div style={{marginTop:"1rem",padding:".875rem",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.6}}>
            총 매도: {fmt(sells.reduce((s,h)=>s+h.actionAmt,0))}원 →
            총 매수: {fmt(Math.abs(buys.reduce((s,h)=>s+h.actionAmt,0)))}원
          </div>
        </Card>
      )}

      {sells.length===0&&buys.length===0&&(
        <div style={{background:"#eaf3de",borderRadius:"var(--border-radius-lg)",padding:"1.5rem",textAlign:"center",fontSize:13,color:"#27500a"}}>
          모든 자산이 벤치마크 비중 ±5%p 이내에 있습니다. 리밸런싱 불필요.
        </div>
      )}
    </div>
  );
}

// ─── 4-8. 경고·손절 ──────────────────────────────────────────────────────────
function AlertsPanel({portfolio,onStopLossChange,onMddChange}){
  const [slVal,setSlVal]=useState(portfolio.stopLoss||-20);
  const [mddVal,setMddVal]=useState(portfolio.mddLimit||-15);
  const total=portfolio.total;

  const alerts=[];
  if(portfolio.mdd<portfolio.mddLimit)
    alerts.push({level:"danger",title:`MDD ${portfolio.mdd.toFixed(1)}% — 제한선(${portfolio.mddLimit}%) 초과`,body:"추가 매수를 중단하고 방어 자산 비중을 우선 확보하세요."});

  portfolio.holdings.forEach(h=>{
    const cur=Math.round(h.amt/total*1000)/10;
    const diff=Math.round((cur-(h.target||0))*10)/10;
    if(Math.abs(diff)>=7)
      alerts.push({level:"warn",title:`${h.etf}: ${diff>=0?"+":""}${diff.toFixed(1)}%p 이탈`,body:`현재 ${cur.toFixed(1)}% → 목표 ${(h.target||0).toFixed(1)}%`});
    if(h.costAmt>0){
      const pnl=(h.amt-h.costAmt)/h.costAmt*100;
      if(pnl<slVal)
        alerts.push({level:"danger",title:`[손절] ${h.etf}: 수익률 ${pnl.toFixed(1)}%`,body:`손절 기준(${slVal}%) 초과 — 비중 축소 검토 필요. 현재 ${fmt(h.amt)}원 (원가 ${fmt(h.costAmt)}원)`});
    }
  });

  if(alerts.length===0)
    alerts.push({level:"ok",title:"현재 경고 없음",body:"모든 비중이 목표 범위 내에 있습니다."});

  return(
    <div>
      <Card>
        <ST>현재 경고 목록</ST>
        {alerts.map((a,i)=><ReasonBox key={i} {...a}/>)}
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <Card style={{marginBottom:0}}>
          <ST>손절 기준 설정</ST>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:"1rem"}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>자산 수익률이</span>
            <input type="number" value={slVal} min={-50} max={0} step={1}
              onChange={e=>setSlVal(Number(e.target.value))}
              style={{width:66,textAlign:"right",padding:"5px 8px",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",fontSize:13,background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}/>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>% 이하 시 경고</span>
          </div>
          <Btn danger sm onClick={()=>onStopLossChange&&onStopLossChange(slVal)}>저장</Btn>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:10,lineHeight:1.6}}>
            원가 기록은 구글 시트 [종목 입력] F열에 입력해야 수익률 계산이 가능합니다.
          </div>
        </Card>

        <Card style={{marginBottom:0}}>
          <ST>MDD 제한선 설정</ST>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:"1rem"}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>포트폴리오 MDD</span>
            <input type="number" value={mddVal} min={-50} max={0} step={1}
              onChange={e=>setMddVal(Number(e.target.value))}
              style={{width:66,textAlign:"right",padding:"5px 8px",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",fontSize:13,background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}/>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>% 이하 시 경고</span>
          </div>
          <Btn sm onClick={()=>onMddChange&&onMddChange(mddVal)}>저장</Btn>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:10,lineHeight:1.6}}>
            현재 MDD: <strong>{portfolio.mdd.toFixed(1)}%</strong> · 고점 대비 낙폭
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── 4-9. 변동 추이 ──────────────────────────────────────────────────────────
function HistoryPanel({portfolio}){
  const history=portfolio.history||[];

  // SVG 미니 라인차트
  const CW=560,CH=160,PAD=52;
  const vals=history.map(h=>h.total||0);
  const minV=Math.min(...vals)*0.97, maxV=Math.max(...vals)*1.03;
  const tx=i=>PAD+(i/(Math.max(history.length-1,1)))*(CW-PAD-10);
  const ty=v=>CH-14-((v-minV)/(maxV-minV||1))*(CH-30);
  const lp=history.map((h,i)=>`${i?"L":"M"}${tx(i).toFixed(1)},${ty(h.total||0).toFixed(1)}`).join(" ");
  const ap=lp+` L${tx(history.length-1)},${CH-14} L${tx(0)},${CH-14} Z`;

  // 자산군 비중 추이 (최근 6개)
  const recent=history.slice(-6);
  const allCls=[...new Set(recent.flatMap(h=>Object.keys(h.weights||{})))];

  return(
    <div>
      {history.length<2?(
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"3rem",textAlign:"center",fontSize:13,color:"var(--color-text-secondary)"}}>
          시트를 연결하고 잔고를 2회 이상 입력하면 변동 추이가 표시됩니다.
        </div>
      ):(
        <>
          <Card>
            <ST>총 평가금액 추이</ST>
            <div style={{overflowX:"auto"}}>
              <svg viewBox={`0 0 ${CW} ${CH+20}`} width="100%" style={{display:"block"}}>
                {[0,.25,.5,.75,1].map((t,i)=>{
                  const v=minV+(maxV-minV)*t, y=ty(v);
                  return(<g key={i}><line x1={PAD} y1={y} x2={CW-10} y2={y} stroke="rgba(128,128,128,0.1)" strokeWidth={1}/><text x={PAD-4} y={y+4} textAnchor="end" fontSize={9} fill="var(--color-text-secondary)">{fmt(v)}</text></g>);
                })}
                {history.map((h,i)=>(
                  <text key={i} x={tx(i)} y={CH+14} textAnchor="middle" fontSize={9} fill="var(--color-text-secondary)">{h.date}</text>
                ))}
                <path d={ap} fill="#185fa515"/>
                <path d={lp} fill="none" stroke="#185fa5" strokeWidth={2.5}/>
                {history.map((h,i)=>(
                  <circle key={i} cx={tx(i)} cy={ty(h.total||0)} r={3} fill="#185fa5"/>
                ))}
              </svg>
            </div>
          </Card>

          <Card>
            <ST>최근 스냅샷</ST>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                  <th style={{textAlign:"left",padding:"5px 8px",fontSize:11,color:"var(--color-text-secondary)",fontWeight:600}}>날짜</th>
                  <th style={{textAlign:"left",padding:"5px 8px",fontSize:11,color:"var(--color-text-secondary)",fontWeight:600}}>전략</th>
                  <th style={{textAlign:"right",padding:"5px 8px",fontSize:11,color:"var(--color-text-secondary)",fontWeight:600}}>총 평가금액</th>
                  <th style={{textAlign:"right",padding:"5px 8px",fontSize:11,color:"var(--color-text-secondary)",fontWeight:600}}>전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0,10).map((h,i,arr)=>{
                  const prev=arr[i+1];
                  const chg=prev&&prev.total>0?((h.total-prev.total)/prev.total*100):null;
                  return(
                    <tr key={i} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                      <td style={{padding:"7px 8px",fontWeight:500}}>{h.date}</td>
                      <td style={{padding:"7px 8px",color:"var(--color-text-secondary)",fontSize:11}}>{h.strategy||"—"}</td>
                      <td style={{padding:"7px 8px",textAlign:"right",fontWeight:500}}>{fmt(h.total||0)}원</td>
                      <td style={{padding:"7px 8px",textAlign:"right",color:chg===null?"var(--color-text-secondary)":chg>=0?"#3b6d11":"#a32d2d",fontWeight:500}}>
                        {chg===null?"—":`${chg>=0?"+":""}${chg.toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {recent.length>0&&allCls.length>0&&(
            <Card style={{marginBottom:0}}>
              <ST>자산군별 비중 추이 (최근 {recent.length}회)</ST>
              {allCls.filter(cls=>recent.some(h=>(h.weights||{})[cls]>0)).map(cls=>(
                <div key={cls} style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                  <div style={{fontSize:11,minWidth:100,color:"var(--color-text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cls}</div>
                  <div style={{flex:1,display:"flex",gap:2}}>
                    {recent.map((h,i)=>{
                      const pct=(h.weights||{})[cls]||0;
                      return(
                        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{width:"100%",height:24,background:"var(--color-background-secondary)",borderRadius:3,overflow:"hidden",display:"flex",alignItems:"flex-end"}}>
                            <div style={{width:"100%",height:`${Math.min(pct/30*100,100)}%`,background:ASSET_COLORS[cls]||"#888",borderRadius:2}}/>
                          </div>
                          <span style={{fontSize:9,color:"var(--color-text-secondary)"}}>{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{display:"flex",gap:4,marginTop:8}}>
                {recent.map((h,i)=><div key={i} style={{flex:1,textAlign:"center",fontSize:9,color:"var(--color-text-secondary)"}}>{h.date}</div>)}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── 4-10. 종목 입력 ──────────────────────────────────────────────────────────
function EntryPanel({ latestTickers, krEtfs, tickerMap, onSave, isSaving, confirmAction }) {
  const [items, setItems] = useState([]);
  const [saveDate, setSaveDate] = useState(new Date().toISOString().split("T")[0]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (latestTickers && latestTickers.length > 0) {
      setItems(latestTickers.map(item => ({
        ticker: item.ticker || "",
        name: item.name || "",
        assetClass: item.assetClass || "",
        quantity: item.quantity || 0,
        currentPrice: item.currentPrice || 0,
        amount: item.amount || 0,
        costAmt: item.costAmt || 0
      })));
    } else if (items.length === 0) {
      setItems([{ ticker: "", name: "", assetClass: "", quantity: 0, currentPrice: 0, amount: 0, costAmt: 0 }]);
    }
  }, [latestTickers]);

  const addItem = () => setItems([...items, { ticker: "", name: "", assetClass: "", quantity: 0, currentPrice: 0, amount: 0, costAmt: 0 }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  // 실시간 시세 동기화 함수 (서버리스 엔드포인트 활용)
  async function syncPrices() {
    // 유효한 티커 필터링
    const tickers = items
      .map(it => String(it.ticker).trim())
      .filter(t => t && t.length >= 2); 
    
    if (tickers.length === 0) return alert("시세를 조회할 티커(종목코드)가 없습니다.");

    setIsFetching(true);
    try {
      // 서버리스 API를 통한 시세 조회 시도
      const res = await fetch("/api/vix"); // 현재 VIX API가 가격 정보를 일부 포함하거나 확장될 것을 가정
      // 만약 별도의 price API가 있다면 해당 경로를 사용합니다.
      // 여기서는 데모 또는 확장 가능성을 위해 구조만 유지합니다.
      alert("현재가 동기화 기능은 준비 중입니다. (서버리스 엔드포인트 구성 필요)");
    } catch (e) {
      console.error("Sync Error:", e);
      alert("시세 동기화 중 오류가 발생했습니다.");
    }
    setIsFetching(false);
  }

  const clearAll = () => {
    confirmAction(
      "입력 내용 초기화",
      "현재 입력된 모든 종목과 금액 정보를 삭제하시겠습니까? 이 동작은 되돌릴 수 없습니다.",
      () => setItems([{ ticker: "", name: "", assetClass: "", quantity: 0, buyPrice: 0, currentPrice: 0, amount: 0, costAmt: 0 }])
    );
  };
  
  const updateItem = (idx, field, val) => {
    const next = [...items];
    const item = { ...next[idx], [field]: val };

    // 수기 입력 모드: 자동 매핑 로직 제거
    if (field === "ticker") {
      item.ticker = val;
    } else if (field === "name") {
      item.name = val;
    }

    // 자동 계산 로직 (매수가 제거됨)
    const q = Number(item.quantity) || 0;
    const cp = Number(item.currentPrice) || 0;

    // 평가금액은 여전히 자동 계산 (주식수 * 현재가)
    if (cp > 0) {
      item.amount = q * cp;
    }

    next[idx] = item;
    setItems(next);
  };

  const totalAmt = items.reduce((s, h) => s + (Number(h.amount) || 0), 0);

  return (
    <div>
      <Card>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:15}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>종목 및 잔고 입력</div>
            <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>오늘(또는 선택 날짜)의 평가금액을 입력하세요.</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--color-background-secondary)",padding:"4px 10px",borderRadius:6,border:"0.5px solid var(--color-border-tertiary)"}}>
              <span style={{fontSize:11,color:"var(--color-text-secondary)",fontWeight:500}}>기록 날짜</span>
              <input type="date" value={saveDate} onChange={e=>setSaveDate(e.target.value)} style={{border:"none",background:"none",fontSize:12,color:"var(--color-text-primary)",fontFamily:"inherit",outline:"none"}} />
            </div>
            <Btn sm onClick={syncPrices} style={{background:"#185fa5",color:"#fff",borderColor:"transparent"}}>{isFetching ? "조회 중..." : "현재가 동기화 ↻"}</Btn>
            <Btn sm onClick={addItem}>+ 행 추가</Btn>
            <Btn sm onClick={clearAll}>초기화</Btn>
          </div>
        </div>

        <div style={{overflowX:"auto",margin:"0 -4px",border:"1px solid var(--color-border-tertiary)",borderRadius:8}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1000}}>
            <thead>
              <tr style={{background:"var(--color-background-secondary)",borderBottom:"2px solid var(--color-border-tertiary)"}}>
                <th style={{textAlign:"left",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"10%"}}>티커</th>
                <th style={{textAlign:"left",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"18%"}}>종목명(설명)</th>
                <th style={{textAlign:"left",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"12%"}}>자산군</th>
                <th style={{textAlign:"right",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"10%"}}>주식수</th>
                <th style={{textAlign:"right",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"12%"}}>
                  현재가
                  <div style={{fontSize:9,fontWeight:400,color:"var(--color-text-secondary)",marginTop:2}}>*기록 날짜 기준 종가</div>
                </th>
                <th style={{textAlign:"right",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"12%"}}>매수원가(총액)</th>
                <th style={{textAlign:"right",padding:"12px 10px",color:"var(--color-text-primary)",fontSize:12,fontWeight:600,borderRight:"1px solid var(--color-border-tertiary)",width:"12%"}}>평가금액</th>
                <th style={{width:50,background:"#fff"}}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{borderBottom:"1px solid var(--color-border-tertiary)",background:i%2===1?"#fafbfc":"#fff"}}>
                  <td style={{padding:0,borderRight:"1px solid var(--color-border-tertiary)"}}>
                    <input value={item.ticker} onChange={e => updateItem(i, "ticker", e.target.value)} placeholder="069500" style={{width:"100%",padding:"10px 12px",border:"none",background:"transparent",fontSize:13,color:"var(--color-text-primary)",fontFamily:"monospace",outline:"none"}} />
                  </td>
                  <td style={{padding:0,borderRight:"1px solid var(--color-border-tertiary)"}}>
                    <input value={item.name} onChange={e => updateItem(i, "name", e.target.value)} placeholder="종목명 입력" style={{width:"100%",padding:"10px 12px",border:"none",background:"transparent",fontSize:13,color:"var(--color-text-primary)",outline:"none"}} />
                  </td>
                  <td style={{padding:0,borderRight:"1px solid var(--color-border-tertiary)"}}>
                    <select value={item.assetClass} onChange={e => updateItem(i, "assetClass", e.target.value)} style={{width:"100%",padding:"10px",border:"none",background:"transparent",fontSize:13,color:"var(--color-text-primary)",outline:"none",cursor:"pointer"}}>
                      <option value="">(선택)</option>
                      {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{padding:0,borderRight:"1px solid var(--color-border-tertiary)"}}>
                    <input type="number" value={item.quantity||""} onChange={e => updateItem(i, "quantity", e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right",padding:"10px 12px",border:"none",background:"transparent",fontSize:13,color:"var(--color-text-primary)",outline:"none",fontVariantNumeric:"tabular-nums"}} />
                  </td>
                  <td style={{padding:"10px 12px",textAlign:"right",borderRight:"1px solid var(--color-border-tertiary)",fontSize:13,color:"#185fa5",fontWeight:500,background:item.currentPrice>0?"#f0f7ff":"transparent",fontVariantNumeric:"tabular-nums"}}>
                    {item.currentPrice > 0 ? fmt(item.currentPrice) : "-"}
                  </td>
                  <td style={{padding:0,borderRight:"1px solid var(--color-border-tertiary)"}}>
                    <input type="number" value={item.costAmt||""} onChange={e => updateItem(i, "costAmt", e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right",padding:"10px 12px",border:"none",background:"#f9f9f9",fontSize:13,color:"var(--color-text-secondary)",outline:"none",fontVariantNumeric:"tabular-nums"}} />
                  </td>
                  <td style={{padding:"10px 12px",textAlign:"right",borderRight:"1px solid var(--color-border-tertiary)",fontSize:13,color:"#0c447c",fontWeight:700,background:"#f0f7ff",fontVariantNumeric:"tabular-nums"}}>
                    {item.amount > 0 ? fmt(Math.round(item.amount)) : "0"}
                  </td>
                  <td style={{textAlign:"center",padding:0}}>
                    <button onClick={() => removeItem(i)} title="행 삭제" style={{border:"none",background:"none",color:"#ccc",cursor:"pointer",fontSize:18,padding:"8px",width:"100%",height:"100%",display:"block",transition:"all 0.2s"}} onMouseOver={e=>{e.target.style.color="#a32d2d";e.target.style.background="#fcebeb"}} onMouseOut={e=>{e.target.style.color="#ccc";e.target.style.background="none"}}>&times;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginTop:"2.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:15,paddingTop:"1.5rem",borderTop:"1px dashed var(--color-border-tertiary)"}}>
          <div style={{background:"var(--color-background-secondary)",padding:".875rem 1.5rem",borderRadius:12,border:"1px solid var(--color-border-tertiary)"}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)",fontWeight:500}}>총 평가금액 합계</span>
            <div style={{fontSize:22,fontWeight:700,color:"var(--color-text-primary)",marginTop:2}}>{fmt(totalAmt)}원</div>
          </div>
          <div style={{display:"flex",gap:12}}>
            <Btn primary onClick={() => onSave(items, saveDate)} style={{minWidth:160,height:48,fontSize:14,borderRadius:10,boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>{isSaving ? "데이터베이스에 저장 중..." : "데이터베이스에 저장 ↗"}</Btn>
          </div>
        </div>
      </Card>
      <div style={{background:"#fdf2f2",borderRadius:10,padding:"1.25rem",fontSize:13,color:"#791f1f",lineHeight:1.7,border:"0.5px solid #f8d7da"}}>
        <div style={{fontWeight:700,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:16}}>⚠️</span> 주의 사항
        </div>
        <div>'저장' 버튼을 누르면 <strong>{saveDate}</strong> 날짜의 데이터가 현재 입력된 내용으로 클라우드 DB에 동기화됩니다.</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 메인 앱
// ═══════════════════════════════════════════════════════════════════════════
const TABS=[
  {id:"dashboard",    label:"대시보드"},
  {id:"strategy",     label:"투자 전략"},
  {id:"rebalance",    label:"리밸런싱 판단"},
  {id:"roadmap",      label:"은퇴 로드맵"},
  {id:"entry",        label:"종목 입력"},
  {id:"compare",      label:"비중 비교"},
  {id:"history",      label:"변동 추이"},
  {id:"report",       label:"월간 리포트"},
  {id:"account",      label:"계정 설정"},
];

export default function PensionPilot(){
  const [tab,setTab]=useState("dashboard");
  const [portfolio,setPortfolio]=useState(DEMO_PORTFOLIO);
  const [vix,setVix]=useState(23.4);
  const [vixLoading,setVixLoading]=useState(false);
  const [isDemo,setIsDemo]=useState(true);
  const [krEtfs, setKrEtfs] = useState([]); // 한국 상장 ETF 전체 목록
  const [tickerMap, setTickerMap] = useState({}); // 티커-자산군 매핑 데이터
  const [modal, setModal] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const [user, setUser] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const confirmAction = (title, message, onConfirm) => {
    setModal({ isOpen: true, title, message, onConfirm });
  };

  // 1. Supabase 데이터 로드 함수
  async function loadPortfolio() {
    if (!user) return;
    try {
      setIsFetching(true);
      // 포트폴리오 메인 정보 (Holdings)
      const { data: holdings, error: hErr } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", user.id);
      if (hErr) throw hErr;

      // 설정 정보 (Config)
      const { data: configs, error: cErr } = await supabase
        .from("config")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (cErr && cErr.code !== "PGRST116") throw cErr;

      // 스냅샷 정보 (Snapshots)
      const { data: snapshots, error: sErr } = await supabase
        .from("snapshots")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (sErr) throw sErr;

      // 상태 병합 (holdings 필드 매핑)
      const mappedHoldings = (holdings || []).map(it => ({
        etf: it.name,
        code: it.ticker,
        cls: it.asset_class,
        target: 0, // 기본값 (전략에 따라 나중에 계산됨)
        amt: Number(it.amount) || 0,
        costAmt: Number(it.cost_amt) || 0,
        cur: 0 // 계산 전
      }));

      const total = mappedHoldings.reduce((sum, h) => sum + h.amt, 0);

      setPortfolio({
        ...DEMO_PORTFOLIO,
        strategy: configs?.strategy_id || "allseason",
        total: total,
        holdings: mappedHoldings,
        history: (snapshots || []).map(s => ({
          date: s.date,
          total: s.total_amt,
          strategy: s.strategy_id,
          weights: s.weights
        })),
        latestTickers: (holdings || []).map(it => ({
          ticker: it.ticker,
          name: it.name,
          assetClass: it.asset_class,
          quantity: it.quantity,
          currentPrice: it.current_price,
          amount: it.amount,
          costAmt: it.cost_amt
        }))
      });
      setIsDemo(false);
    } catch (e) {
      console.error("Load Error:", e.message);
    } finally {
      setIsFetching(false);
    }
  }

  // 2. 인증 관련 핸들러
  async function handleLogin(email, password) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      alert("로그인 성공!");
    } catch (e) {
      alert("로그인 실패: " + e.message);
    }
  }

  async function handleSignUp(email, password) {
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      alert("회원가입 신청 성공! 메일함을 확인해 주세요.");
    } catch (e) {
      alert("회원가입 실패: " + e.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setPortfolio(DEMO_PORTFOLIO);
    setIsDemo(true);
    setTab("dashboard");
  }

  // VIX 실시간 지수 직접 조회
  async function fetchVix() {
    setVixLoading(true);
    try {
      const yahooUrl = encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX');
      const directRes = await fetch(`https://api.allorigins.win/get?url=${yahooUrl}`);
      if (directRes.ok) {
        const wrapper = await directRes.json();
        const d = JSON.parse(wrapper.contents);
        const val = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (typeof val === "number" && val > 0) {
          setVix(val);
          setVixLoading(false);
          return;
        }
      }
      const res = await fetch("/api/vix");
      const d = await res.json();
      if (d && typeof d.vix === "number" && Number.isFinite(d.vix)) setVix(d.vix);
    } catch (e) {
      console.warn("VIX 조회 실패:", e.message);
    }
    setVixLoading(false);
  }

  function enforceIrpRiskCap(p){
    // IRP(연금저축 X) 위험자산 70% 제한 가드레일
    if (p?.accountType !== "IRP") return p;

    const RISK_ASSETS = [
      "미국주식","선진국주식","신흥국주식","국내주식",
      "금","원자재","부동산리츠","하이일드채권"
    ];
    const CASH_CLS = "현금MMF";

    const holdings = p.holdings || [];
    const riskSum = holdings.reduce((s, h) => (
      RISK_ASSETS.includes(h.cls) ? s + (Number(h.target) || 0) : s
    ), 0);

    if (!Number.isFinite(riskSum) || riskSum <= 70) return p;

    // 위험자산 비중을 70%까지 스케일링하고, 부족분은 현금MMF로 흡수
    const scale = 70 / riskSum;
    const nextHoldings = holdings.map(h => {
      if (!RISK_ASSETS.includes(h.cls)) return h;
      return { ...h, target: (Number(h.target) || 0) * scale };
    });

    const nextTotal = nextHoldings.reduce((s, h) => s + (Number(h.target) || 0), 0);
    const diff = 100 - nextTotal;
    if (diff > 0) {
      const idx = nextHoldings.findIndex(h => h.cls === CASH_CLS);
      if (idx >= 0) {
        nextHoldings[idx] = { ...nextHoldings[idx], target: (Number(nextHoldings[idx].target) || 0) + diff };
      } else {
        nextHoldings.push({ etf: CASH_CLS, code: "", cls: CASH_CLS, target: diff, amt: 0, costAmt: 0, cur: 0 });
      }
    }

    // 부동소수 오차 정리
    const total2 = nextHoldings.reduce((s, h) => s + (Number(h.target) || 0), 0);
    if (total2 > 0 && Math.abs(total2 - 100) > 0.0001) {
      const factor = 100 / total2;
      for (let i = 0; i < nextHoldings.length; i++) {
        nextHoldings[i] = { ...nextHoldings[i], target: (Number(nextHoldings[i].target) || 0) * factor };
      }
    }

    return { ...p, holdings: nextHoldings };
  }

  async function refreshMomentum(strategyId, payload){
    // 모멘텀 전략은 월말 기준으로 목표 비중이 동적으로 바뀔 수 있으므로,
    // 백엔드가 계산한 assetClass target을 holdings.target에 반영한다.
    try{
      const res = await fetch("/api/momentum",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          strategyId,
          asOf:new Date().toISOString(),
          benchmark:payload?.benchmark || {},
          assetHoldings:payload?.assetHoldings || []
        })
      });
      if(!res.ok) throw new Error();
      const d = await res.json();
      if(d && d.ok && d.targets){
        const momentumMode = d?.mode || "";
        const momentumUpdatedAt = d?.updatedAt || "";
        setPortfolio(p=>{
          const updatedHoldings = (p.holdings||[]).map(h=>{
            const has = Object.prototype.hasOwnProperty.call(d.targets, h.cls);
            const t = d.targets[h.cls];
            return has ? { ...h, target:Number(t) } : { ...h, target:0 };
          });
          const next = enforceIrpRiskCap({ ...p, holdings: updatedHoldings });
          return { ...next, momentumMode, momentumUpdatedAt };
        });
      }
    }catch(e){
      // 계산 실패 시: 기존(GAS 정적 benchmark) 목표 비중을 그대로 사용
    }
  }

  function applyStrategy(id){
    const s = getStrat(id);
    const holdings = portfolio.holdings || [];
    const benchmark = Object.fromEntries(holdings.map(h => [h.cls, h.target]));

    // 모멘텀 전략은 “전략만 변경”해도 target 비중이 바뀌어야 하므로 계산을 재시도
    if (s && s.type === "momentum") {
      refreshMomentum(id, {
        benchmark,
        assetHoldings: holdings
      });
    }

    setPortfolio(p => ({ ...p, strategy: id }));
  }

  async function updateConfig(updates) {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('config')
        .upsert({
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
      loadPortfolio();
    } catch (e) {
      console.error("Config Update Error:", e.message);
    }
  }

  function handleSelectStrategy(id) {
    const s = getStrat(id);
    confirmAction(
      "투자 전략 변경",
      `현재 전략을 [${s.name}] (이)로 변경하시겠습니까?`,
      () => {
        setPortfolio(p => ({ ...p, strategy: id }));
        updateConfig({ strategy_id: id });
      }
    );
  }

  async function handleSaveEntries(items, date) {
    if (!user) {
      alert("로그인이 필요합니다. [계정 설정] 탭에서 로그인해 주세요.");
      setTab("setup");
      return;
    }
    if (items.length === 0) return;

    setIsSaving(true);
    try {
      const saveDate = date || new Date().toISOString().split("T")[0];
      
      // 1. 기존 종목 삭제 (해당 유저의 모든 종목 초기화 후 재입력 또는 Upsert logic)
      // 여기서는 단순하게 기존 데이터를 삭제하고 새 데이터를 넣는 방식을 취함 (가장 확실함)
      const { error: delErr } = await supabase
        .from('holdings')
        .delete()
        .eq('user_id', user.id);
      
      if (delErr) throw delErr;

      // 2. 새 종목 삽입
      const insertItems = items
        .filter(it => it.ticker)
        .map(it => ({
          user_id: user.id,
          ticker: it.ticker,
          name: it.name || "",
          asset_class: it.assetClass || "",
          quantity: Number(it.quantity) || 0,
          current_price: Number(it.currentPrice) || 0,
          cost_amt: Number(it.costAmt) || 0,
          amount: Number(it.amount) || 0,
          updated_at: new Date().toISOString()
        }));

      if (insertItems.length > 0) {
        const { error: insErr } = await supabase
          .from('holdings')
          .insert(insertItems);
        if (insErr) throw insErr;
      }

      // 3. 스냅샷 기록 (Snapshots)
      const weights = {};
      const total = items.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
      items.forEach(h => {
        if (total > 0) weights[h.assetClass] = Math.round((Number(h.amount) / total) * 1000) / 10;
      });

      const { error: snapErr } = await supabase
        .from('snapshots')
        .insert({
          user_id: user.id,
          date: saveDate,
          strategy_id: portfolio.strategy,
          total_amt: total,
          weights: weights
        });
      if (snapErr) throw snapErr;

      alert("데이터가 Supabase DB에 안전하게 저장되었습니다.");
      loadPortfolio(); // 최신 데이터 재로드
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    }
    setIsSaving(false);
  }

function AuthSetup({ user, onLogin, onSignUp, onLogout }) {
  const [isSign, setIsSign] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return (
      <Card>
        <ST>계정 정보</ST>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>로그인 이메일</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{user.email}</div>
        </div>
        <div style={{ background: "#eaf3de", padding: "1rem", borderRadius: 8, marginBottom: "1.5rem", fontSize: 12, color: "#27500a", lineHeight: 1.6 }}>
          ✓ 표준 데이터베이스(Supabase)에 연결되었습니다. 이제 모든 정보가 클라우드에 안전하게 저장됩니다.
        </div>
        <Btn danger onClick={onLogout}>로그아웃</Btn>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 400, margin: "0 auto" }}>
      <ST>{isSign ? "회원가입" : "로그인"}</ST>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input 
          type="email" placeholder="이메일" value={email} 
          onChange={e => setEmail(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} 
        />
        <input 
          type="password" placeholder="비밀번호" value={password} 
          onChange={e => setPassword(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} 
        />
        <Btn primary onClick={() => isSign ? onSignUp(email, password) : onLogin(email, password)}>
          {isSign ? "가입하기" : "로그인"}
        </Btn>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button 
            onClick={() => setIsSign(!isSign)} 
            style={{ fontSize: 12, background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", textDecoration: "underline" }}
          >
            {isSign ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
          </button>
        </div>
      </div>
    </Card>
  );
}

  // 앱 로드 및 인증 상태 감지
  useEffect(() => {
    fetchVix();
    
    // Auth 감지
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadPortfolio();
  }, [user]);

  return(
    <div style={{fontFamily:"var(--font-sans)",color:"var(--color-text-primary)"}}>
      {/* 앱 헤더 */}
      <div style={{background:"var(--color-background-primary)",borderBottom:"0.5px solid var(--color-border-tertiary)",padding:"1rem 1.25rem",marginBottom:"1.25rem"}}>
        <div style={{maxWidth:940,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontSize:17,fontWeight:500,marginBottom:2}}>연금 포트폴리오 파일럿</div>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>삼성증권 IRP/연금저축 · Supabase 클라우드 DB · 은퇴 목표 관리</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {isDemo&&<Badge c="#633806" bg="#faeeda">데모 모드</Badge>}
            <Badge c={vixLoading?"var(--color-text-secondary)":"#27500a"} bg={vixLoading?"var(--color-background-secondary)":"#eaf3de"}>VIX {vixLoading?"…":vix.toFixed(1)}</Badge>
            <Btn sm onClick={()=>setTab("account")}>{user?"계정 관리":"로그인"}</Btn>
            <Btn sm onClick={()=>setTab("report")} danger>월간 리포트 PDF</Btn>
          </div>
        </div>
      </div>

      <div style={{maxWidth:940,margin:"0 auto",padding:"0 1rem"}}>
        {/* 탭 */}
        <div style={{display:"flex",gap:2,borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:"1.5rem",overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 15px",fontSize:13,border:"none",background:"none",cursor:"pointer",color:tab===t.id?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:`2px solid ${tab===t.id?"var(--color-text-primary)":"transparent"}`,fontWeight:tab===t.id?500:400,fontFamily:"var(--font-sans)",marginBottom:-1,whiteSpace:"nowrap"}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 패널 */}
        {tab==="dashboard" &&<Dashboard portfolio={portfolio} vix={vix} vixLoading={vixLoading} onFetchVix={fetchVix} onGo={setTab}/>}
        {tab==="strategy"  &&<StrategySelect accountType={portfolio.accountType} onStrategyApply={handleSelectStrategy}/>}
        {tab==="rebalance" &&<RebalanceJudge portfolio={portfolio} vix={vix}/>}
        {tab==="roadmap"   &&<RetirementRoadmap strategyId={portfolio.strategy}/>}
        {tab==="entry"     &&<EntryPanel latestTickers={portfolio.latestTickers} krEtfs={krEtfs} tickerMap={tickerMap} onSave={handleSaveEntries} isSaving={isSaving} confirmAction={confirmAction} sheetUrl={sheetUrl} />}
        {tab==="compare"   &&<CompareWeights portfolio={portfolio}/>}
        {tab==="alerts"    &&<AlertsPanel portfolio={portfolio} onStopLossChange={v=>setPortfolio(p=>({...p,stopLoss:v}))} onMddChange={v=>setPortfolio(p=>({...p,mddLimit:v}))}/>}
        {tab==="history"   &&<HistoryPanel portfolio={portfolio}/>}
        {tab==="report"    &&<MonthlyReport portfolio={portfolio} vix={vix} strategy={portfolio.strategy}/>}
        {tab==="account"     && (
          <AuthSetup 
            user={user} 
            onLogin={handleLogin} 
            onSignUp={handleSignUp} 
            onLogout={handleLogout} 
          />
        )}
      </div>
      <ConfirmModal {...modal} onClose={() => setModal(m => ({ ...m, isOpen: false }))} />
    </div>
  );
}
