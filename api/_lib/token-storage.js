import { supabase } from './supabase-client.js';

/**
 * DB에서 캐시된 토큰을 가져옵니다.
 * 만료 전이라면 토큰 정보를 반환하고, 만료되었거나 없으면 null을 반환합니다.
 */
export async function getCachedTokenFromDB(serviceName) {
  try {
    const { data, error } = await supabase
      .from('api_tokens')
      .select('token, expires_at')
      .eq('service_name', serviceName)
      .single();

    if (error || !data) return null;

    const now = new Date();
    const expiry = new Date(data.expires_at);

    // 여유 있게 만료 1분 전까지 유효한 것으로 처리
    if (now.getTime() < expiry.getTime() - 60000) {
      return {
        token: data.token,
        expiry: expiry.getTime()
      };
    }
  } catch (e) {
    console.warn(`[TokenStorage] Select error for ${serviceName}:`, e.message);
  }
  return null;
}

/**
 * 새로운 토큰을 DB에 저장(업데이트)합니다.
 */
export async function saveTokenToDB(serviceName, token, expiresInSeconds) {
  try {
    // KIS API는 보통 expires_in을 초 단위로 줍니다 (86400 = 24시간)
    const expiresAt = new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
    
    const { error } = await supabase
      .from('api_tokens')
      .upsert({
        service_name: serviceName,
        token: token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
    console.log(`[TokenStorage] Saved new token for ${serviceName}. Expiry: ${expiresAt}`);
  } catch (e) {
    console.error(`[TokenStorage] Upsert error for ${serviceName}:`, e.message);
  }
}
