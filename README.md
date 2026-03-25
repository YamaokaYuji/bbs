# 🧵 Simple BBS

シンプルな5ch風掲示板です。  
Node.js + Expressで動作します。

---

## 🚀 起動方法

### ① リポジトリを取得
```bash
git clone https://github.com/YamaokaYuji/bbs.git
cd bbs
```
### ② パッケージインストール
```bash
npm install
```
### ③ data.jsonを作成（重要）
```bash
echo '{ "threads": [] }' > data.json
```
### ④ サーバー起動
```bash
node server.js
```
### ⑤ ブラウザでアクセス
```bash
http://localhost:3000
```
