# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies including devDependencies for build
RUN npm ci

# Copy source code
COPY src ./src/
COPY tsconfig.json ./

# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

# Build the application
RUN npm run build

# Remove devDependencies
RUN npm ci --only=production && npm cache clean --force

# Expose port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]