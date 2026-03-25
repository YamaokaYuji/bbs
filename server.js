const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Cloudflareなどプロキシ経由でも実IP取得
app.set('trust proxy', true);

const DATA_FILE = path.join(__dirname, "data.json");

// HTMLエスケープ
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// URLリンク化
function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// 書き込みキューで競合回避
const writeQueue = [];
function writeDataSafe(data) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ data, resolve, reject });
    if (writeQueue.length === 1) processQueue();
  });
}
function processQueue() {
  if (!writeQueue.length) return;
  const { data, resolve, reject } = writeQueue[0];
  fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), err => {
    if (err) reject(err);
    else resolve();
    writeQueue.shift();
    processQueue();
  });
}

// データ読み込み
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ threads: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// --- ユーザーID生成 ---
function getUserId(req, res) {
  let userId = req.cookies.userid;
  if (!userId) {
    const ip = req.ip || "anon";
    const random = crypto.randomBytes(4).toString("hex");
    userId = crypto.createHash("md5").update(ip + random).digest("hex");
    res.cookie("userid", userId, { maxAge: 1000*60*60*24*365 }); // 1年有効
  }
  return userId;
}

// --- スレッド一覧 ---
app.get("/api/threads", (req, res) => {
  const data = readData();
  data.threads = data.threads.map(t => ({
    ...t,
    title: escapeHtml(t.title),
    created: Number(t.created) || Date.now()
  }));
  res.json(data.threads);
});

// --- スレッド取得 ---
app.get("/api/thread/:id", (req, res) => {
  const data = readData();
  const thread = data.threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: "スレッドが存在しません" });

  thread.posts = thread.posts.map(p => ({
    ...p,
    name: escapeHtml(p.name),
    text: linkify(escapeHtml(p.text))
  }));

  res.json(thread);
});

// --- スレッド作成 ---
app.post("/api/thread", async (req, res) => {
  let { title, name } = req.body;
  if (!title || title.trim() === "") return res.status(400).json({ error: "タイトル必須" });
  if (title.length > 100) return res.status(400).json({ error: "タイトル長すぎ" });
  if (name && name.length > 30) name = name.slice(0,30);

  const data = readData();
  const id = Date.now().toString(36);
  const newThread = {
    id,
    title: escapeHtml(title),
    created: Number(Date.now()),
    posts: [],
    lastPost: Date.now()
  };
  data.threads.unshift(newThread);
  try { await writeDataSafe(data); } catch(e){ return res.status(500).json({ error: "保存エラー" }); }

  res.json(newThread);
});

// --- レス投稿 ---
app.post("/api/post", async (req, res) => {
  let { threadId, name, text } = req.body;
  if (!text || text.trim() === "") return res.status(400).json({ error: "本文必須" });
  if (text.length > 1000) return res.status(400).json({ error: "本文長すぎ" });
  if (name && name.length > 30) name = name.slice(0,30);

  const data = readData();
  const thread = data.threads.find(t => t.id === threadId);
  if (!thread) return res.status(404).json({ error: "スレッドが存在しません" });

  const now = Date.now();
  const lastPost = thread.posts[thread.posts.length-1];
  if (lastPost && now - lastPost.time < 10000) return res.status(400).json({ error: "連投は10秒待ってください" });

  const id = getUserId(req, res); // Cookie + IPで安定ID生成

  thread.posts.push({
    id,
    name: escapeHtml(name || "名無し"),
    text: linkify(escapeHtml(text)),
    time: now
  });

  if (thread.posts.length > 1000) thread.posts.shift();

  try { await writeDataSafe(data); } catch(e){ return res.status(500).json({ error: "保存エラー" }); }

  res.json({ ok:true });
});

app.listen(3000, ()=>console.log("XSS安全版BBS（Cloudflare対応・ID固定） http://localhost:3000"));
