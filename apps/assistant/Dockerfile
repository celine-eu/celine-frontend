# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

ENV CI=true

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages ./packages
COPY apps/assistant ./apps/assistant

# Build
RUN pnpm -F @celine-eu/assistant build
RUN CI=true pnpm deploy --legacy --filter @celine-eu/assistant --prod /out


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
