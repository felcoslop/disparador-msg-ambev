# Build stage
FROM node:20 AS build

WORKDIR /app

# Ensure we have a clean environment
RUN npm config set fund false
RUN npm config set audit false

# Copy package files
COPY package.json ./
# If package-lock.json exists, copy it, else it will be skipped
COPY package-lock.json* ./

# Install dependencies with legacy-peer-deps to avoid conflicts
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
