export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, subject, body } = req.body;

  if (!email) return res.status(400).json({ error: 'Recipient email is required' });

  try {
    // 실제 운영 시 Resend, SendGrid, AWS SES 등을 사용합니다.
    // 여기서는 Resend API 구조를 기준으로 작성하되, API 키가 없으면 Console Mock으로 처리합니다.
    const apiKey = process.env.RESEND_API_KEY;

    if (apiKey) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Pension Strategy <no-reply@resend.dev>',
          to: email,
          subject: subject,
          html: body
        })
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Email sending failed');
    } else {
      console.log(`\n[EMAIL MOCK] To: ${email}\n[SUBJECT]: ${subject}\n[BODY]: ${body}\n`);
    }

    return res.status(200).json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('Email API Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
