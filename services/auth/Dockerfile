# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for building
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY ./shared ./shared
COPY ./services/auth ./services/auth

# Install dependencies
RUN npm ci --workspace=@yeyzer/types --workspace=@yeyzer/utils --workspace=@yeyzer/auth
RUN npm run build --workspace=@yeyzer/types --workspace=@yeyzer/utils --workspace=@yeyzer/auth

# Production stage
FROM node:18-alpine AS production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4001

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production dependencies only
COPY package*.json ./
COPY --from=builder /app/shared/types/package.json ./shared/types/package.json
COPY --from=builder /app/shared/utils/package.json ./shared/utils/package.json
COPY --from=builder /app/services/auth/package.json ./services/auth/package.json

# Install production dependencies
RUN npm ci --omit=dev --workspace=@yeyzer/types --workspace=@yeyzer/utils --workspace=@yeyzer/auth

# Copy built artifacts
COPY --from=builder /app/shared/types/dist ./shared/types/dist
COPY --from=builder /app/shared/utils/dist ./shared/utils/dist
COPY --from=builder /app/services/auth/dist ./services/auth/dist

# Set proper permissions
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

# Start the service
CMD ["node", "services/auth/dist/index.js"]
