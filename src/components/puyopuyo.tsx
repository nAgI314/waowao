import { useState, useEffect, useCallback, useRef } from 'react';

const BOARD_WIDTH = 6;
const BOARD_HEIGHT = 12;
const CELL_SIZE = 40;

type Board = number[][];
type Position = { x: number; y: number };
type Puyo = { x: number; y: number; color: number };

const COLORS = [
  '#ff0000', // 赤
  '#00ff00', // 緑
  '#0000ff', // 青
  '#ffff00', // 黄
  '#ff00ff', // 紫
];

// GitHub設定（環境変数から取得することを推奨）
const GITHUB_CONFIG = {
  owner: 'nAgI314', // GitHubユーザー名
  repo: 'waowao', // リポジトリ名
};

export default function PuyoPuyo() {
  const [board, setBoard] = useState<Board>(() =>
    Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0))
  );
  const [currentPair, setCurrentPair] = useState<Puyo[]>([]);
  const [pairRotation, setPairRotation] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isDropping, setIsDropping] = useState<boolean>(false);
  const [clearingPositions, setClearingPositions] = useState<Position[]>([]);
  const [chainCount, setChainCount] = useState<number>(0);
  const [showChainText, setShowChainText] = useState<boolean>(false);
  const [clearedCount, setClearedCount] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.6);

  // 録音関連のstate
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [showRecordModal, setShowRecordModal] = useState<boolean>(true);
  const [prUrl, setPrUrl] = useState<string>('');

  const [userName, setUserName] = useState("");
  const [availableAudios, setAvailableAudios] = useState<string[]>([]); // ← 追加：アップロード済み音声一覧

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const savedUser = localStorage.getItem("github_user");
    if (savedUser) setUserName(savedUser);
  }, []);

  // 🎵 アップロード済み音声一覧を取得
  useEffect(() => {
    const fetchAudios = async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/public/audio`
        );
        const data = await res.json();
        const audioFiles = data
          .filter((f: any) => f.name.endsWith(".webm"))
          .map((f: any) => f.download_url);
        setAvailableAudios(audioFiles);
      } catch (err) {
        console.error("音声リスト取得エラー:", err);
      }
    };
    fetchAudios();
  }, []);

  // 録音開始
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);

        // ストリームを停止
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setUploadStatus('録音中...');
    } catch (error) {
      console.error('録音エラー:', error);
      setUploadStatus('マイクへのアクセスが拒否されました');
    }
  };

  // 録音停止
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // BlobをBase64に変換
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // data:audio/webm;base64, の部分を除去
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // --- GitHubログインヘルパー ---
  const loginWithGitHub = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    if (!clientId) {
      alert("❌ NEXT_PUBLIC_CLIENT_ID が設定されていません");
      return;
    }

    // リダイレクトURIは /callback に統一
    const redirectUri = `${window.location.origin}/callback`;
    const scope = "repo,user";
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

    console.log("🔗 GitHub認証URL:", url);
    window.location.href = url;
  };

  // --- アクセストークンを取得する関数 ---
  const getGitHubToken = async () => {
    // 1. ローカルストレージから取得
    let token = localStorage.getItem("github_token");
    if (token) {
      console.log("✅ キャッシュからトークン取得");
      await fetchGitHubUser(token);
      return token;
    }

    // 2. URLからcodeを取得（主にローカルテスト用）
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      try {
        const res = await fetch(`/api/git-auth?code=${encodeURIComponent(code)}`);
        const data = await res.json();

        if (data.access_token) {
          localStorage.setItem("github_token", data.access_token);
          window.history.replaceState({}, document.title, "/");
          console.log("✅ コードからトークン取得");
          return data.access_token;
        } else {
          throw new Error(data.error || "トークン取得失敗");
        }
      } catch (err) {
        console.error("❌ トークン取得エラー:", err);
        return null;
      }
    }

    return null;
  };

  // GitHubユーザー情報を取得
  const fetchGitHubUser = async (token: string) => {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!res.ok) throw new Error("ユーザー情報取得失敗");
      const data = await res.json();
      console.log("👤 GitHubユーザー:", data.login);
      setUserName(data.login);
      localStorage.setItem("github_user", data.login);
    } catch (err) {
      console.error("❌ ユーザー取得エラー:", err);
    }
  };

  // GitHub APIを使ってPRを作成
  const createPullRequest = async (audioBlob: Blob) => {
    let token = await getGitHubToken();

    if (!token) {
      const confirmed = window.confirm("GitHubにログインしてください。ログイン画面に移動しますか？");
      if (confirmed) {
        loginWithGitHub();
      }
      return;
    }

    // ✅ ここで確実にユーザー名を取得
    let user = userName;
    if (!user) {
      console.log("🔍 GitHubユーザー名が未設定なので再取得します...");
      await fetchGitHubUser(token); // state更新
      const savedUser = localStorage.getItem("github_user");
      user = savedUser || "unknown";
      setUserName(user);
    }

    console.log("👤 現在のGitHubユーザー:", user);

    setUploadStatus('アップロード中...');

    try {
      const base64Audio = await blobToBase64(audioBlob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const branchName = `audio-upload-${timestamp}`;
      let fileName = `wao-${timestamp}-${Math.random().toString(36).slice(2, 6)}.webm`;

      // ① mainブランチの最新SHAを取得
      const refRes = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/git/refs/heads/main`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!refRes.ok) {
        throw new Error(`ブランチ取得失敗: ${refRes.status}`);
      }

      const refData = await refRes.json();
      const baseSha = refData.object.sha;

      // ② 新しいブランチを作成
      const createBranchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: baseSha,
          }),
        }
      );

      if (!createBranchRes.ok) {
        throw new Error(`ブランチ作成失敗: ${createBranchRes.status}`);
      }

      // ③ 音声ファイルをアップロード
      const putRes = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/public/audio/${fileName}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({
            message: `Add wao voice: ${fileName}`,
            content: base64Audio,
            branch: branchName,
          }),
        }
      );

      const putData = await putRes.json();
      if (!putRes.ok) {
        throw new Error(putData.message || "Upload failed");
      }

      setRecordedAudioUrl(`https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${branchName}/public/audio/${fileName}`);
      setUploadStatus('✅ 音声をアップロードしました');

      // ④ HTMLプレビューファイルを作成
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Audio Preview - ${fileName}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(to bottom, #4299e1, #667eea);
      min-height: 100vh;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 { color: #2d3748; margin-bottom: 30px; }
    audio {
      width: 100%;
      margin: 20px 0;
      border-radius: 10px;
    }
    .info {
      background: #edf2f7;
      padding: 20px;
      border-radius: 10px;
      margin-top: 20px;
    }
    .wao {
      font-size: 48px;
      text-align: center;
      margin: 30px 0;
      animation: bounce 1s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎤 ﾜｵ! 音声プレビュー</h1>
    <div class="wao">ﾜｵ!</div>
    <audio controls autoplay>
      <source src="${fileName}" type="audio/webm">
    </audio>
    <div class="info">
      <p><strong>ファイル名:</strong> ${fileName}</p>
      <p><strong>アップロード日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
      <p><strong>形式:</strong> WebM Audio</p>
    </div>
  </div>
</body>
</html>`;

      const base64Html = btoa(unescape(encodeURIComponent(htmlContent)));

      await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/public/audio/preview-${timestamp}.html`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `Add audio preview: ${fileName}`,
            content: base64Html,
            branch: branchName
          })
        }
      );

      // ⑤ Pull Requestを作成
      const prRes = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/pulls`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `🎤 新しいﾜｵ!音声 from ${user}`,
            head: branchName,
            base: 'main',
            body: `## 🎉 ${user}さんの新しいﾜｵ!音声がアップロードされました！

### 🔊 プレビュー
[こちらをクリックして試聴](https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${branchName}/public/audio/${fileName})

### 📁 ファイル情報
- **ファイル名**: \`${fileName}\`
- **アップロード日時**: ${new Date().toLocaleString('ja-JP')}
- **形式**: WebM Audio

---  
*このPRは自動生成されました*`
          })
        }
      );

      const prData = await prRes.json();

      if (prData.html_url) {
        setPrUrl(prData.html_url);
        setUploadStatus('✅ アップロード完了！PRが作成されました');
        setTimeout(() => {
          setShowRecordModal(false);
        }, 3000);
      } else {
        throw new Error(prData.message || 'PR作成に失敗しました');
      }

    } catch (error) {
      console.error('❌ アップロードエラー:', error);
      setUploadStatus(`❌ エラー: ${error}`);
    }
  };

  const createNewPair = useCallback((): Puyo[] => {
    const color1 = Math.floor(Math.random() * COLORS.length) + 1;
    const color2 = Math.floor(Math.random() * COLORS.length) + 1;
    return [
      { x: 2, y: 0, color: color1 },
      { x: 2, y: 1, color: color2 }
    ];
  }, []);

  const checkCollision = useCallback((puyos: Puyo[], brd: Board = board): boolean => {
    for (const puyo of puyos) {
      if (
        puyo.x < 0 ||
        puyo.x >= BOARD_WIDTH ||
        puyo.y >= BOARD_HEIGHT ||
        (puyo.y >= 0 && brd[puyo.y][puyo.x])
      ) {
        return true;
      }
    }
    return false;
  }, [board]);

  const findConnectedGroups = useCallback((brd: Board): Position[][] => {
    const visited = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(false));
    const groups: Position[][] = [];

    const dfs = (y: number, x: number, color: number, group: Position[]) => {
      if (y < 0 || y >= BOARD_HEIGHT || x < 0 || x >= BOARD_WIDTH) return;
      if (visited[y][x] || brd[y][x] !== color || brd[y][x] === 0) return;

      visited[y][x] = true;
      group.push({ x, y });

      dfs(y - 1, x, color, group);
      dfs(y + 1, x, color, group);
      dfs(y, x - 1, color, group);
      dfs(y, x + 1, color, group);
    };

    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (!visited[y][x] && brd[y][x] > 0) {
          const group: Position[] = [];
          dfs(y, x, brd[y][x], group);

          if (group.length >= 4) {
            groups.push(group);
          }
        }
      }
    }

    return groups;
  }, []);

  const applyGravity = useCallback((brd: Board): Board => {
    const newBoard = brd.map(row => [...row]);

    for (let x = 0; x < BOARD_WIDTH; x++) {
      let writePos = BOARD_HEIGHT - 1;
      for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        if (newBoard[y][x] > 0) {
          if (writePos !== y) {
            newBoard[writePos][x] = newBoard[y][x];
            newBoard[y][x] = 0;
          }
          writePos--;
        }
      }
    }

    return newBoard;
  }, []);

  const playSound = useCallback(() => {
    if (availableAudios.length > 0) {
      const randomUrl =
        availableAudios[Math.floor(Math.random() * availableAudios.length)];
      const audio = new Audio(randomUrl);
      audio.volume = volume;
      audio.play().catch(() => { });
    }
  }, [availableAudios, volume]);

  const placePair = useCallback(() => {
    if (currentPair.length === 0) return;

    setIsDropping(true);
    let newBoard = board.map(row => [...row]);

    for (const puyo of currentPair) {
      if (puyo.y >= 0) {
        newBoard[puyo.y][puyo.x] = puyo.color;
      }
    }

    newBoard = applyGravity(newBoard);
    setBoard(newBoard);

    let chain = 0;
    let totalCleared = 0;

    const processChains = () => {
      const groups = findConnectedGroups(newBoard);

      if (groups.length > 0) {
        chain++;

        const allToRemove: Position[] = groups.flat();
        totalCleared += allToRemove.length;

        playSound();

        setClearingPositions(allToRemove);
        setClearedCount(allToRemove.length);

        setChainCount(chain);
        setShowChainText(true);

        setTimeout(() => {
          setClearingPositions([]);
          setShowChainText(false);

          const clearedBoard = newBoard.map(row => [...row]);
          for (const pos of allToRemove) {
            clearedBoard[pos.y][pos.x] = 0;
          }

          newBoard = applyGravity(clearedBoard);
          setBoard(newBoard);

          setTimeout(() => processChains(), 300);
        }, 400);
      } else {
        if (totalCleared > 0) {
          const bonus = chain > 1 ? Math.pow(2, chain - 1) : 1;
          setScore(s => s + totalCleared * 10 * bonus);
        }

        const newPair = createNewPair();
        if (checkCollision(newPair, newBoard)) {
          setGameOver(true);
        } else {
          setCurrentPair(newPair);
          setPairRotation(0);
        }
        setIsDropping(false);
      }
    };

    setTimeout(() => processChains(), 200);
  }, [board, currentPair, applyGravity, findConnectedGroups, createNewPair, checkCollision, playSound]);

  const moveDown = useCallback(() => {
    if (currentPair.length === 0 || gameOver || isPaused || isDropping) return;

    const newPair = currentPair.map(p => ({ ...p, y: p.y + 1 }));
    if (!checkCollision(newPair)) {
      setCurrentPair(newPair);
    } else {
      placePair();
    }
  }, [currentPair, gameOver, isPaused, isDropping, checkCollision, placePair]);

  const moveHorizontal = useCallback((dir: number) => {
    if (currentPair.length === 0 || gameOver || isPaused || isDropping) return;

    const newPair = currentPair.map(p => ({ ...p, x: p.x + dir }));
    if (!checkCollision(newPair)) {
      setCurrentPair(newPair);
    }
  }, [currentPair, gameOver, isPaused, isDropping, checkCollision]);

  const rotate = useCallback(() => {
    if (currentPair.length !== 2 || gameOver || isPaused || isDropping) return;

    const [axis, satellite] = currentPair;
    const newRotation = (pairRotation + 1) % 4;

    let newSatellite = { ...satellite };
    if (newRotation === 0) newSatellite = { x: axis.x, y: axis.y - 1, color: satellite.color };
    else if (newRotation === 1) newSatellite = { x: axis.x + 1, y: axis.y, color: satellite.color };
    else if (newRotation === 2) newSatellite = { x: axis.x, y: axis.y + 1, color: satellite.color };
    else if (newRotation === 3) newSatellite = { x: axis.x - 1, y: axis.y, color: satellite.color };

    const newPair = [axis, newSatellite];
    if (!checkCollision(newPair)) {
      setCurrentPair(newPair);
      setPairRotation(newRotation);
    }
  }, [currentPair, pairRotation, gameOver, isPaused, isDropping, checkCollision]);

  const hardDrop = useCallback(() => {
    if (currentPair.length === 0 || gameOver || isPaused || isDropping) return;

    let newPair = currentPair.map(p => ({ ...p }));
    while (!checkCollision(newPair.map(p => ({ ...p, y: p.y + 1 })))) {
      newPair = newPair.map(p => ({ ...p, y: p.y + 1 }));
    }
    setCurrentPair(newPair);
    setTimeout(() => placePair(), 50);
  }, [currentPair, gameOver, isPaused, isDropping, checkCollision, placePair]);

  useEffect(() => {
    if (currentPair.length === 0 && !gameOver && !isDropping) {
      const newPair = createNewPair();
      setCurrentPair(newPair);
      setPairRotation(0);
    }
  }, [currentPair, gameOver, isDropping, createNewPair]);

  useEffect(() => {
    const interval = setInterval(moveDown, 800);
    return () => clearInterval(interval);
  }, [moveDown]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') moveHorizontal(-1);
      if (e.key === 'ArrowRight') moveHorizontal(1);
      if (e.key === 'ArrowDown') moveDown();
      if (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z') rotate();
      if (e.key === ' ') {
        e.preventDefault();
        hardDrop();
      }
      if (e.key === 'p' || e.key === 'P') setIsPaused(p => !p);
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [moveHorizontal, moveDown, rotate, hardDrop]);

  const resetGame = () => {
    setBoard(Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0)));
    setCurrentPair([]);
    setScore(0);
    setGameOver(false);
    setIsPaused(false);
    setIsDropping(false);
    setClearingPositions([]);
    setChainCount(0);
    setClearedCount(0);
    setShowChainText(false);
  };

  const renderBoard = (): Board => {
    const displayBoard = board.map(row => [...row]);

    for (const puyo of currentPair) {
      if (puyo.y >= 0 && puyo.y < BOARD_HEIGHT && puyo.x >= 0 && puyo.x < BOARD_WIDTH) {
        displayBoard[puyo.y][puyo.x] = puyo.color;
      }
    }

    return displayBoard;
  };

  const handleUpload = async () => {
    if (!recordedAudioUrl) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    await createPullRequest(audioBlob);

  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-400 to-blue-600 p-4 w-screen h-screen">
      {/* 録音モーダル */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-3xl font-bold text-center mb-4 text-blue-900">ﾜｵ!を録音しよう</h2>
            <div className="flex flex-col gap-4 items-center">
              {!isRecording && !recordedAudioUrl && (
                <button
                  onClick={startRecording}
                  className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full text-xl transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
                >
                  <span>🎤</span> 録音開始
                </button>
              )}

              {isRecording && (
                <button
                  onClick={stopRecording}
                  className="px-8 py-4 bg-gray-700 hover:bg-gray-800 text-white font-bold rounded-full text-xl transition-all transform hover:scale-105 shadow-lg animate-pulse"
                >
                  ⏹️ 録音停止
                </button>
              )}

              {recordedAudioUrl && (
                <div className="flex flex-col gap-3 items-center w-full">
                  <audio src={recordedAudioUrl} controls className="w-full" />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRecordedAudioUrl(null);
                        setUploadStatus('');
                        setPrUrl('');
                      }}
                      className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all"
                    >
                      録音し直す
                    </button>
                    <button
                      onClick={handleUpload}
                      className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition-all"
                    >
                      GitHubにアップロード
                    </button>
                  </div>
                </div>
              )}

              {uploadStatus && (
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-900 mb-2">
                    {uploadStatus}
                  </p>
                  {prUrl && (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline text-sm"
                    >
                      PRを確認する →
                    </a>
                  )}
                </div>
              )}

              {recordedAudioUrl && (
                <button
                  onClick={() => {
                    const audio = new Audio(recordedAudioUrl);
                    audio.volume = volume;
                    audio.play().catch(() => { });
                    setShowRecordModal(false);
                    setUploadStatus('🎮 ゲームを開始しました！');
                  }}
                  className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg text-lg transition-all transform hover:scale-105"
                >
                  アップロードせずに始める
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center mt-6">
              ※ マイクへのアクセス許可が必要です<br />
              ※ GitHub設定が必要です（コード内のGITHUB_CONFIGを編集）
            </p>
          </div>
        </div>
      )}

      <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">ﾜｵぷよ</h1>

      <div className="mb-4 text-center relative">
        <div className="text-3xl font-bold text-white mb-2 drop-shadow">スコア: {score}</div>
        {isPaused && <div className="text-xl text-yellow-300 font-bold">一時停止中</div>}
        {gameOver && <div className="text-2xl text-red-300 font-bold animate-pulse">ゲームオーバー</div>}
      </div>

      {showChainText && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
          style={{
            animation: 'fadeInOut 0.6s ease-out'
          }}
        >
          <div className="text-center">
            <div
              className="text-8xl font-black text-yellow-300 mb-2"
              style={{
                textShadow: '4px 4px 0 #ff00ff, -4px -4px 0 #00ffff, 0 0 20px rgba(255,255,255,0.8)',
                animation: 'scaleUp 0.6s ease-out'
              }}
            >
              {clearedCount}個消した！
            </div>
            {chainCount > 1 && (
              <div
                className="text-6xl font-bold text-white"
                style={{
                  textShadow: '3px 3px 0 #ff6b6b, -2px -2px 0 #4ecdc4',
                  animation: 'scaleUp 0.6s ease-out 0.1s both'
                }}
              >
                {chainCount}連鎖！
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scaleUp {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div className="relative">
        <div
          className="border-8 border-white rounded-lg shadow-2xl mb-4"
          style={{
            width: BOARD_WIDTH * CELL_SIZE,
            height: BOARD_HEIGHT * CELL_SIZE,
            display: 'grid',
            gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${CELL_SIZE}px)`,
            backgroundColor: '#f0f0f0'
          }}
        >
          {renderBoard().map((row, y) =>
            row.map((cell, x) => {
              const isClearing = clearingPositions.some(p => p.x === x && p.y === y);
              return (
                <div
                  key={`${y}-${x}`}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: cell ? COLORS[cell - 1] : 'transparent',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: cell ? '50%' : '0',
                    boxSizing: 'border-box',
                    boxShadow: cell
                      ? 'inset -2px -2px 4px rgba(0,0,0,0.2), inset 2px 2px 4px rgba(255,255,255,0.5)'
                      : 'none',
                    transform: isClearing ? 'scale(0) rotate(180deg)' : 'scale(1) rotate(0deg)',
                    opacity: isClearing ? 0 : 1,
                    transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    transformOrigin: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {cell > 0 && (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: 'rgba(255, 255, 255, 0.9)',
                        textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                        userSelect: 'none',
                        fontFamily: 'monospace',
                      }}
                    >
                      ﾜｵ!
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="hidden md:block text-white text-center mb-4 bg-blue-800 bg-opacity-50 p-4 rounded-lg">
        <div className="mb-2 font-bold">矢印キー: 移動</div>
        <div className="mb-2 font-bold">↑ / Z: 回転</div>
        <div className="mb-2 font-bold">スペース: 高速落下</div>
        <div className="font-bold">P: 一時停止</div>
        <div className="mt-2 text-sm">4つ以上つなげると消えるよ！</div>
      </div>

      {gameOver && (
        <button
          onClick={resetGame}
          className="px-8 py-4 bg-yellow-400 hover:bg-yellow-500 text-blue-900 font-bold rounded-full text-xl transition-all transform hover:scale-105 shadow-lg"
        >
          もう一回！
        </button>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2 md:hidden">
        <button onClick={() => moveHorizontal(-1)} className="px-4 py-3 bg-blue-800 text-white rounded-lg font-bold">←</button>
        <button onClick={rotate} className="px-4 py-3 bg-blue-800 text-white rounded-lg font-bold">↻</button>
        <button onClick={() => moveHorizontal(1)} className="px-4 py-3 bg-blue-800 text-white rounded-lg font-bold">→</button>
        <button onClick={moveDown} className="px-4 py-3 bg-blue-800 text-white rounded-lg font-bold col-start-2">↓</button>
        <button onClick={hardDrop} className="px-4 py-3 bg-yellow-400 text-blue-900 rounded-lg font-bold col-span-3">高速落下</button>
      </div>
      <div className="flex items-center justify-center gap-2 mt-3">
        <span className="text-white text-sm font-bold">音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-40 accent-yellow-400 cursor-pointer"
        />
        <span className="text-white text-sm w-8 text-right">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
}
