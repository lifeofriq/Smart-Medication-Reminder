import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API = 'http://localhost:3000';
const socket = io(API);

export default function App() {
  const [schedules, setSchedules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    fetchSchedules();
    fetchLogs();

    socket.on('schedules', data => setSchedules(data));
    socket.on('log', data => {
      setLogs(prev => [data, ...prev].slice(0, 100));
      if (data.event === 'ALARM ON')
        toast.info(`💊 Alarm: ${data.schedule} (${data.time || ''})`);
    });

    return () => socket.disconnect();
  }, []);

  async function fetchSchedules() {
    const res = await axios.get(`${API}/api/schedules`);
    setSchedules(res.data);
  }
  async function fetchLogs() {
    const res = await axios.get(`${API}/api/logs`);
    setLogs(res.data);
  }
  async function addSchedule() {
    await axios.post(`${API}/api/schedules`, { time, label });
    setTime(''); setLabel('');
  }
  async function delSchedule(id) {
    await axios.delete(`${API}/api/schedules/${id}`);
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>🩺 Smart Medication Reminder Dashboard</h1>

      <h2>Schedules</h2>
      <ul>
        {schedules.map((s) => (
          <li key={s.id}>
            {s.time} {s.label && `- ${s.label}`}
            <button onClick={() => delSchedule(s.id)} style={{ marginLeft: 10 }}>❌</button>
          </li>
        ))}
      </ul>

      <div>
        <input placeholder="HH:MM" value={time} onChange={e => setTime(e.target.value)} />
        <input placeholder="Label" value={label} onChange={e => setLabel(e.target.value)} />
        <button onClick={addSchedule}>➕ Add</button>
      </div>

      <h2>Recent Logs</h2>
      <table border="1" cellPadding="6">
        <thead>
          <tr><th>Time</th><th>Event</th><th>Schedule</th></tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <tr key={i}>
              <td>{l.ts || l.time}</td>
              <td>{l.event}</td>
              <td>{l.schedule}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ToastContainer position="top-right" />
    </div>
  );
}
