# Pulled from the AWS ECR public mirror instead of Docker Hub: anonymous Hub
# pulls are rate-limited on shared CI IPs, which fails the build within seconds.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# better-sqlite3 falls back to `node-gyp rebuild` when no prebuilt binary
# matches the ABI, and the slim image ships none of that toolchain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM deps AS builder
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV GS_DATA_DIR=/data
EXPOSE 4317
CMD ["node", "dist/src/server.js"]
