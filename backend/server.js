import express from "express";
import cors from "cors";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";
import pool from './db.js';

const app = express();
const PORT = 3000;

// ======== Setup path ========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======== Middleware ========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend"))); // serve index.html

// ======== Database setup ========
// Buat tabel jika belum ada
await pool.query(`  CREATE TABLE IF NOT EXISTS schedules (
    id SERIAL PRIMARY KEY,
    time TEXT NOT NULL
  );`);

await pool.query(`  CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    event TEXT,
    timestamp TEXT
  );`);

// ======== MQTT setup ========
const mqttClient = mqtt.connect("mqtt://test.mosquitto.org");

mqttClient.on("connect", () => {
console.log("✅ Connected to MQTT broker");
mqttClient.subscribe("medreminder2/log");
});

mqttClient.on("message", async (topic, message) => {
if (topic === "medreminder2/log") {
const data = JSON.parse(message.toString());
console.log("📥 MQTT Log:", data);
await pool.query(
"INSERT INTO logs(event, timestamp) VALUES($1, $2)",
[data.event, data.time]
);
}
});

// ======== API Routes ========

// Get schedules
app.get("/api/schedules", async (req, res) => {
const result = await pool.query("SELECT * FROM schedules ORDER BY time");
res.json(result.rows);
});

// Add new schedule
app.post("/api/schedules", async (req, res) => {
const { time } = req.body;
await pool.query("INSERT INTO schedules(time) VALUES($1)", [time]);
res.json({ message: "Schedule added" });
});

// Delete schedule
app.delete("/api/schedules/:id", async (req, res) => {
const { id } = req.params;
await pool.query("DELETE FROM schedules WHERE id=$1", [id]);
res.json({ message: "Schedule deleted" });
});

// Get logs
app.get("/api/logs", async (req, res) => {
const result = await pool.query(
"SELECT * FROM logs ORDER BY id DESC LIMIT 50"
);
res.json(result.rows);
});

// ======== Serve UI ========
app.get("*", (req, res) => {
res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ======== Start server ========
app.listen(PORT, () => {
console.log(`🚀 Server running at http://localhost:${PORT}`);
});
