import React, { useState } from "react";
import { Card, ST, Btn } from "./index.jsx";

export default function AuthSetup({ user, onLogin, onSignUp, onLogout, isSaving }) {
  const [isSign, setIsSign] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    return (
      <Card>
        <ST>계정 정보</ST>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>로그인 이메일</div>
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
          style={{ padding: "10px 12px", borderRadius: 8, border: "0.5px solid var(--border-glass)", background: "var(--bg-card)", color: "var(--text-main)" }} 
        />
        <input 
          type="password" placeholder="비밀번호" value={password} 
          onChange={e => setPassword(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "0.5px solid var(--border-glass)", background: "var(--bg-card)", color: "var(--text-main)" }} 
        />
        <Btn primary onClick={() => isSign ? onSignUp(email, password) : onLogin(email, password)} disabled={isSaving}>
          {isSaving ? "처리 중..." : (isSign ? "가입하기" : "로그인")}
        </Btn>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button 
            onClick={() => setIsSign(!isSign)} 
            style={{ fontSize: 12, background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", textDecoration: "underline" }}
          >
            {isSign ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}
          </button>
        </div>
      </div>
    </Card>
  );
}
