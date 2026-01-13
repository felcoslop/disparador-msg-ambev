# Build stage
FROM node:20 AS build

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code and build React app
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy only production dependencies (optional but cleaner)
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --production --legacy-peer-deps

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Copy backend files and database logic
COPY server.js .
COPY database.js .

# Create an empty database if it doesn't exist (it will be initialized by server.js anyway)
# RUN touch database.sqlite

EXPOSE 3000

CMD ["node", "server.js"]
