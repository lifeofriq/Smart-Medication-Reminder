// server.js (ESM version + better-sqlite3)
import dotenv from "dotenv";
import express from "express";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

// --- Fix __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- ENV ---
const PORT = process.env.PORT || 3000;
const MQTT_URL = process.env.MQTT_URL;
const TOPIC_LOG = process.env.MQTT_TOPIC_LOG || "medreminder2/log";
const TOPIC_CONTROL = process.env.MQTT_TOPIC_CONTROL || "medreminder2/control";
const TOPIC_CONFIG = process.env.MQTT_TOPIC_CONFIG || "medreminder2/config";

// --- DB (better-sqlite3) ---
const db = new Database(path.join(__dirname, "medreminder.db"));

// Create tables if not exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    event TEXT,
    time TEXT,
    raw TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hhmm TEXT NOT NULL
  )
`).run();

// --- MQTT client ---
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("✅ MQTT connected");
  mqttClient.subscribe(TOPIC_LOG, (err) => {
    if (err) console.error("Subscribe error:", err);
  });
  pushSchedulesToDevice();
});

mqttClient.on("message", (topic, payload) => {
  if (topic === TOPIC_LOG) {
    const text = payload.toString();
    let obj = null;
    try {
      obj = JSON.parse(text);
    } catch (e) {}
    const event = obj?.event || "UNKNOWN";
    const time = obj?.time || null;

    const stmt = db.prepare(`INSERT INTO logs(event, time, raw) VALUES (?, ?, ?)`);
    stmt.run(event, time, text);

    io.emit("log", { event, time, raw: text });
  }
});

// --- helper: publish schedules retained ---
function pushSchedulesToDevice() {
  const rows = db.prepare(`SELECT hhmm FROM schedules ORDER BY hhmm ASC`).all();
  const schedules = rows.map((r) => r.hhmm);
  const payload = JSON.stringify({ schedules });
  mqttClient.publish(TOPIC_CONFIG, payload, { retain: true });
  console.log("📤 Pushed retained config:", payload);
}

// --- REST API ---
app.get("/api/logs", (req, res) => {
  const limit = Number(req.query.limit || 100);
  const rows = db.prepare(
    `SELECT id, ts, event, time, raw FROM logs ORDER BY id DESC LIMIT ?`
  ).all(limit);
  res.json(rows);
});

app.get("/api/schedules", (req, res) => {
  const rows = db.prepare(`SELECT id, hhmm FROM schedules ORDER BY hhmm ASC`).all();
  res.json(rows);
});

app.post("/api/schedules", (req, res) => {
  const schedules = Array.isArray(req.body.schedules) ? req.body.schedules : [];
  const valid = schedules.every((s) => /^\d{2}:\d{2}$/.test(s));
  if (!valid) return res.status(400).json({ error: "Invalid HH:MM array" });

  const deleteStmt = db.prepare("DELETE FROM schedules");
  deleteStmt.run();

  const insertStmt = db.prepare("INSERT INTO schedules(hhmm) VALUES (?)");
  const insertMany = db.transaction((arr) => {
    for (const s of arr) insertStmt.run(s);
  });
  insertMany(schedules);

  pushSchedulesToDevice();
  res.json({ ok: true, schedules });
});

app.post("/api/control", (req, res) => {
  const { cmd } = req.body;
  if (!["ACK", "TAKEN"].includes(cmd)) {
    return res.status(400).json({ error: "cmd must be ACK or TAKEN" });
  }
  mqttClient.publish(TOPIC_CONTROL, cmd);
  res.json({ ok: true });
});

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// --- WebSocket ---
io.on("connection", (socket) => {
  console.log("💻 UI connected:", socket.id);
});

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
