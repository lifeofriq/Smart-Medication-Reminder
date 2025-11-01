# Gunakan image Node.js resmi
FROM node:18-alpine

# Set working directory di container
WORKDIR /app

# Copy semua file ke dalam container
COPY backend ./backend

# Masuk ke folder backend dan install dependencies
WORKDIR /app/backend
RUN npm install

# Jalankan server
CMD ["npm", "start"]

# Port yang digunakan server.js
EXPOSE 3000
