# Smart Medication Reminder (IoT Project)

Smart Medication Reminder adalah sistem IoT yang membantu pengguna mengingat jadwal minum obat melalui perangkat **ESP32** dan **web dashboard berbasis MQTT**.

---

## Fitur
-  CRUD jadwal minum obat (buat, ubah, hapus, lihat)
-  Log aktivitas “obat sudah diminum” atau belum
-  Notifikasi dan update **real-time** via MQTT + Socket.IO
-  Integrasi dengan perangkat ESP32 (buzzer, LED, RTC, OLED)
-  Dashboard web sederhana untuk monitoring dan kontrol

---

## ⚙️ Cara Menjalankan

### 1️⃣ Clone Repository
```bash
git clone https://github.com/lifeofriq/Smart-Medication-Reminder.git
cd Smart-Medication-Reminder

### 2️⃣ Install Dependencies Backend
cd backend
npm install

### 3️⃣ Jalankan Server
npm start

