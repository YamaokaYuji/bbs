const express = require("express");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const DATA_FILE = "data.json";

// --- 制限 ---
const threadCooldown = {};
const postCooldown = {};

// --- データ ---
function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- IP取得（Cloudflare対応） ---
function getClientIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

// --- ID生成（日替わり） ---
function generateId(ip) {
  const today = new Date().toDateString();
  return crypto
    .createHash("md5")
    .update(ip + today)
    .digest("hex")
    .slice(0, 8);
}

// --- スレ一覧（新しい順） ---
app.get("/api/threads", (req, res) => {
  const threads = loadData().threads;
  threads.sort((a, b) => b.id - a.id);
  res.json(threads);
});

// --- スレ作成（5分制限） ---
app.post("/api/thread", (req, res) => {
  const data = loadData();
  const ip = getClientIp(req);
  const now = Date.now();

  if (threadCooldown[ip] && now - threadCooldown[ip] < 300000) {
    return res.status(429).json({ error: "スレ立ては5分に1回までです" });
  }

  threadCooldown[ip] = now;

  const newThread = {
    id: Date.now(),
    title: req.body.title,
    posts: []
  };

  data.threads.push(newThread);
  saveData(data);

  res.json(newThread);
});

// --- スレ取得 ---
app.get("/api/thread/:id", (req, res) => {
  const data = loadData();
  const thread = data.threads.find(t => t.id == req.params.id);
  res.json(thread);
});

// --- レス投稿（10秒制限＋1000レス制限） ---
app.post("/api/post", (req, res) => {
  const data = loadData();
  const thread = data.threads.find(t => t.id == req.body.threadId);

  if (!thread) return res.status(404).json({ error: "スレが存在しません" });

  const ip = getClientIp(req);
  const now = Date.now();

  // 10秒制限
  if (postCooldown[ip] && now - postCooldown[ip] < 10000) {
    return res.status(429).json({ error: "連投は10秒待ってください" });
  }

  // 1000レス制限
  if (thread.posts.length >= 1000) {
    return res.status(400).json({ error: "このスレは1000レスに達しました" });
  }

  postCooldown[ip] = now;

  const id = generateId(ip);

  thread.posts.push({
    name: req.body.name || "風吹けば名無し",
    text: req.body.text,
    id: id,
    time: Date.now()
  });

  saveData(data);
  res.json({ ok: true });
});

app.listen(3000, () => console.log("起動 http://localhost:3000"));
