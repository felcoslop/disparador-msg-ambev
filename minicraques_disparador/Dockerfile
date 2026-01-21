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
FROM node:20

WORKDIR /app

# Copy package files and install ALL dependencies (including dev if needed for build, 
# but here we just need sqlite3 to compile correctly)
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Copy backend files and models
COPY server ./server
COPY prisma ./prisma
COPY politics ./politics

# Create data directory for persistent database
RUN mkdir -p /data && chmod 777 /data

# Set production environment
ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/database.sqlite


# Expose port 3000

EXPOSE 3000

# Start using npm to trigger prisma initialization from package.json
CMD ["npm", "start"]
