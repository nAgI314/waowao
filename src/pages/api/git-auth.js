export default async function handler(req, res) {
  // CORSとプリフライト対応
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const code = req.query?.code || req.body?.code;

    console.log('🔍 Received code:', code);

    if (!code) {
      return res.status(400).json({ error: 'code parameter is required' });
    }

    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Missing GitHub OAuth credentials',
      });
    }

    // GitHubトークン取得
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const text = await tokenResponse.text();
    console.log('📝 GitHub Response:', text.substring(0, 200));

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: 'Invalid response from GitHub',
        details: text.substring(0, 500),
      });
    }

    if (data.error) {
      return res.status(400).json({
        error: data.error,
        error_description: data.error_description,
      });
    }

    if (!data.access_token) {
      return res.status(500).json({
        error: 'No access_token received',
        data,
      });
    }

    console.log('✅ Token obtained successfully');

    return res.status(200).json({
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      scope: data.scope,
    });
  } catch (err) {
    console.error('❌ Exception:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
}
