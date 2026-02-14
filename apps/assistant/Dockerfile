# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace metadata first (cache-friendly)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy manifests needed to resolve workspace deps
COPY packages/ui/package.json packages/ui/package.json
COPY packages/assistant-ui/package.json packages/assistant-ui/package.json
COPY apps/assistant/package.json apps/assistant/package.json

RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages ./packages
COPY apps/assistant ./apps/assistant

# Build
RUN pnpm -F @celine-eu/assistant build
RUN pnpm deploy --legacy --filter @celine-eu/assistant --prod /out


# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the deployed standalone app
COPY --from=builder /out/ ./

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "build"]
