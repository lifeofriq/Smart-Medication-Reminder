import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

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
const db = await open({
  filename: "./medreminder.db",
  driver: sqlite3.Database,
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL
  );
`);

await db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT,
    timestamp TEXT
  );
`);

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
    await db.run("INSERT INTO logs (event, timestamp) VALUES (?, ?)", [
      data.event,
      data.time,
    ]);
  }
});

// ======== API Routes ========

// Get schedules
app.get("/api/schedules", async (req, res) => {
  const rows = await db.all("SELECT * FROM schedules ORDER BY time");
  res.json(rows);
});

// Add new schedule
app.post("/api/schedules", async (req, res) => {
  const { time } = req.body;
  await db.run("INSERT INTO schedules (time) VALUES (?)", [time]);
  res.json({ message: "Schedule added" });
});

// Delete schedule
app.delete("/api/schedules/:id", async (req, res) => {
  const { id } = req.params;
  await db.run("DELETE FROM schedules WHERE id = ?", [id]);
  res.json({ message: "Schedule deleted" });
});

// Get logs
app.get("/api/logs", async (req, res) => {
  const logs = await db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 50");
  res.json(logs);
});

// ======== Serve UI ========
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ======== Start server ========
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
