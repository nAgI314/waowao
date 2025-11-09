"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();
  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const error = urlParams.get("error");

  if (error) {
    console.error("❌ GitHub Auth Error:", error);
    alert("GitHub認証エラー: " + error);
    router.push("/");
    return;
  }

  if (code) {
    console.log("📝 Code取得:", code);
    
    // APIを呼び出してトークンを取得
    fetch(`https://waowao-three.vercel.app/api/git-auth?code=${encodeURIComponent(code)}`)

      .then((res) => {
        console.log("📡 API Response Status:", res.status);
        console.log(res);
        // ステータスコードを確認
        if (!res.ok) {
          return res.text().then(text => {
            throw new Error(`HTTP ${res.status}: ${text}`);
          });
          
        }
        
        // JSON として解析
        return res.json();
      })
      .then((data) => {
        console.log("✅ データ取得:", data);
        
        if (data.access_token) {
          console.log("✅ GitHub token保存");
          localStorage.setItem("github_token", data.access_token);
          localStorage.setItem("github_user", data.user.login);
          
          // ホーム画面に戻る
          setTimeout(() => {
            window.location.href = "/";
          }, 1500);
        } else if (data.error) {
          throw new Error(`GitHub API Error: ${data.error} - ${data.error_description}`);
        } else {
          throw new Error("tokenが返されていません: " + JSON.stringify(data));
        }
      })
      .catch((err) => {
        console.error("❌ GitHub Auth Error:", err);
        alert("認証に失敗しました:\n" + err.message);
        router.push("/");
      });
  } else {
    console.warn("⚠️ codeがURLに含まれていません");
    router.push("/");
  }
}, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white bg-gradient-to-b from-blue-400 to-blue-600">
      <h1 className="text-3xl font-bold mb-4">🔐 GitHub ログイン中...</h1>
      <p className="text-lg">しばらくお待ちください。</p>
      <div className="mt-6 flex gap-2">
        <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
        <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
        <div className="w-3 h-3 bg-white rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
      </div>
    </div>
  );
}