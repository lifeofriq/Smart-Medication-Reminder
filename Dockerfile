# Use Node.js 18 (Linux)
FROM node:18

# Create app directory
WORKDIR /app

# Copy package files first for caching
COPY backend/package*.json ./backend/

# Install dependencies (Linux-native build)
WORKDIR /app/backend
RUN npm install --build-from-source sqlite3

# Copy the rest of the files
WORKDIR /app
COPY . .

# Expose backend port
EXPOSE 3000

# Run the backend
CMD ["npm", "start", "--prefix", "backend"]
