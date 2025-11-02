// server.js (ESM version + better-sqlite3) - Railway ready with MQTT AES encryption
import dotenv from "dotenv";
import express from "express";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

// --- Fix __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Ensure data folder exists for DB ---
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// --- DB path ---
const dbPath = path.join(dataDir, "medreminder.db");
const db = new Database(dbPath);

// --- Create tables if not exist ---
db.prepare(`  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    event TEXT,
    time TEXT,
    raw TEXT
  )`).run();

db.prepare(`  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hhmm TEXT NOT NULL
  )`).run();

// --- ENV ---
const PORT = process.env.PORT || 3000;
const MQTT_URL = process.env.MQTT_URL;

// --- Encrypted topics ---
const TOPIC_LOG_ENC     = process.env.MQTT_TOPIC_LOG_ENC     || 'medreminder2/log.enc';
const TOPIC_CONTROL_ENC = process.env.MQTT_TOPIC_CONTROL_ENC || 'medreminder2/control.enc';
const TOPIC_CONFIG_ENC  = process.env.MQTT_TOPIC_CONFIG_ENC  || 'medreminder2/config.enc';

// --- Legacy plaintext topics (optional) ---
const TOPIC_LOG_PLAIN     = process.env.MQTT_TOPIC_LOG     || 'medreminder2/log';
const TOPIC_CONTROL_PLAIN = process.env.MQTT_TOPIC_CONTROL || 'medreminder2/control';
const TOPIC_CONFIG_PLAIN  = process.env.MQTT_TOPIC_CONFIG  || 'medreminder2/config';

// --- Crypto setup (AES-256-CBC) ---
const PASSPHRASE = process.env.SHARED_PASSPHRASE || 'kelompoktugas';
const AES_KEY = crypto.createHash('sha256').update(PASSPHRASE).digest();
const AES_IV  = Buffer.from(process.env.AES_IV_HEX || '0123456789abcdeffedcba9876543210', 'hex');

function encB64(plainStr) {
const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
const enc = Buffer.concat([cipher.update(Buffer.from(plainStr, 'utf8')), cipher.final()]);
return enc.toString('base64');
}

function decB64(b64Str) {
const data = Buffer.from(b64Str, 'base64');
const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, AES_IV);
const dec = Buffer.concat([decipher.update(data), decipher.final()]);
return dec.toString('utf8');
}

// --- Express + Socket.IO ---
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- MQTT client ---
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
console.log("✅ MQTT connected");
mqttClient.subscribe(TOPIC_LOG_ENC, err => err && console.error('Sub ENC log err:', err));
mqttClient.subscribe(TOPIC_LOG_PLAIN, err => err && console.error('Sub LOG legacy err:', err));
pushSchedulesToDevice();
});

mqttClient.on("message", (topic, payload) => {
try {
if (topic === TOPIC_LOG_ENC) {
const b64 = payload.toString();
let plain = '';
try { plain = decB64(b64); } catch (e) { console.error('Decrypt failed:', e.message); return; }
let obj = {};
try { obj = JSON.parse(plain); } catch {}
const event = obj?.event || 'UNKNOWN';
const time  = obj?.time  || null;
db.prepare(`INSERT INTO logs(event, time, raw) VALUES (?, ?, ?)`).run(event, time, plain);
io.emit('log', { event, time, raw: plain });
return;
}
if (topic === TOPIC_LOG_PLAIN) {
const text = payload.toString();
let obj = {};
try { obj = JSON.parse(text); } catch {}
const event = obj?.event || 'UNKNOWN';
const time = obj?.time || null;
db.prepare(`INSERT INTO logs(event, time, raw) VALUES (?, ?, ?)`).run(event, time, text);
io.emit('log', { event, time, raw: text });
return;
}
} catch (e) { console.error('MQTT message error:', e); }
});

// --- Helper: push schedules ---
function pushSchedulesToDevice() {
const rows = db.prepare(`SELECT hhmm FROM schedules ORDER BY hhmm ASC`).all();
const schedules = rows.map(r => r.hhmm);
const payloadPlain = JSON.stringify({ schedules });
const payloadEnc = encB64(payloadPlain);
mqttClient.publish(TOPIC_CONFIG_ENC, payloadEnc, { retain: true });
// Optional legacy plaintext
// mqttClient.publish(TOPIC_CONFIG_PLAIN, payloadPlain, { retain: true });
console.log('📤 Pushed retained ENC config:', payloadPlain);
}

// --- REST API ---
app.get("/api/logs", (req, res) => {
const limit = Number(req.query.limit || 100);
const rows = db.prepare(`SELECT id, ts, event, time, raw FROM logs ORDER BY id DESC LIMIT ?`).all(limit);
res.json(rows);
});

app.get("/api/schedules", (req, res) => {
const rows = db.prepare(`SELECT id, hhmm FROM schedules ORDER BY hhmm ASC`).all();
res.json(rows);
});

app.post("/api/schedules", (req, res) => {
const schedules = Array.isArray(req.body.schedules) ? req.body.schedules : [];
const valid = schedules.every(s => /^\d{2}:\d{2}$/.test(s));
if (!valid) return res.status(400).json({ error: "Invalid HH:MM array" });

db.prepare("DELETE FROM schedules").run();
const insertStmt = db.prepare("INSERT INTO schedules(hhmm) VALUES (?)");
const insertMany = db.transaction(arr => { for (const s of arr) insertStmt.run(s); });
insertMany(schedules);

pushSchedulesToDevice();
res.json({ ok: true, schedules });
});

app.post("/api/control", (req, res) => {
const { cmd } = req.body;
if (!["ACK", "TAKEN"].includes(cmd)) return res.status(400).json({ error: "cmd must be ACK or TAKEN" });
const b64 = encB64(cmd);
mqttClient.publish(TOPIC_CONTROL_ENC, b64);
// Optional legacy plaintext
// mqttClient.publish(TOPIC_CONTROL_PLAIN, cmd);
res.json({ ok: true });
});

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));

// --- WebSocket ---
io.on("connection", socket => console.log("💻 UI connected:", socket.id));

// --- Start server ---
server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
