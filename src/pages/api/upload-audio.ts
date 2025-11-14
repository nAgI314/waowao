import type { NextApiRequest, NextApiResponse } from 'next';

const GITHUB_CONFIG = {
  owner: 'nAgI314',
  repo: 'waowao',
};

// 環境変数から取得
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.warn('⚠️ GITHUB_TOKEN が設定されていません');
}

type ResponseData = {
  success?: boolean;
  audioUrl?: string;
  prUrl?: string;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, base64Audio, timestamp, userName } = req.body;

    if (!fileName || !base64Audio || !userName) {
      return res.status(400).json({ error: 'fileName, base64Audio, and userName are required' });
    }

    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'GitHub token not configured' });
    }

    // ① mainブランチの最新SHAを取得
    const refRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/git/refs/heads/main`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!refRes.ok) {
      throw new Error(`Failed to get main branch: ${refRes.status}`);
    }

    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // ② 新しいブランチを作成
    const branchName = `audio-upload-${timestamp}`;

    const createBranchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      }
    );

    if (!createBranchRes.ok) {
      throw new Error(`Failed to create branch: ${createBranchRes.status}`);
    }

    // ③ 音声ファイルをアップロード
    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/public/audio/${fileName}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message: `Add wao voice: ${fileName}`,
          content: base64Audio,
          branch: branchName,
        }),
      }
    );

    if (!putRes.ok) {
      const errorData = await putRes.json();
      throw new Error(`Failed to upload audio: ${errorData.message}`);
    }

    const audioUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${branchName}/public/audio/${fileName}`;

    // ④ Pull Requestを作成
    const prRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `🎤 ${userName}さんのﾜｵ!がアップロードされました`,
          head: branchName,
          base: 'main',
          body: `## 🎉 ${userName}さんの新しいﾜｵ!音声がアップロードされました！

### 🔊 プレビュー
[こちらをクリックして試聴](${audioUrl})

### 📁 ファイル情報
- **投稿者**: ${userName}さん
- **ファイル名**: \`${fileName}\`
- **アップロード日時**: ${new Date().toLocaleString('ja-JP')}
- **形式**: WebM Audio

---  
*このPRは自動生成されました*`,
        }),
      }
    );

    const prData = await prRes.json();

    if (!prRes.ok) {
      throw new Error(`Failed to create PR: ${prData.message}`);
    }

    return res.status(200).json({
      success: true,
      audioUrl,
      prUrl: prData.html_url,
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}