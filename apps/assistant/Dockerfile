# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all packages
COPY packages/ui/package.json ./packages/ui/
COPY packages/assistant-ui/package.json ./packages/assistant-ui/
COPY apps/assistant/package.json ./apps/assistant/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ui ./packages/ui
COPY packages/assistant-ui ./packages/assistant-ui
COPY apps/assistant ./apps/assistant

# Build the assistant
RUN pnpm --filter @celine-eu/assistant build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built app
COPY --from=builder /app/apps/assistant/build ./build
COPY --from=builder /app/apps/assistant/package.json ./

# Install production dependencies only
RUN pnpm install --prod --ignore-scripts

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "build"]
