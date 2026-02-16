# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Force dev deps in builder regardless of CI env poisoning
ENV NODE_ENV=development
ENV CI=true

COPY . .

# Install ALL deps (including devDependencies)
RUN pnpm install --frozen-lockfile --prod=false

# Build
RUN pnpm -F @celine-eu/assistant build

# Deploy standalone runtime bundle
RUN pnpm deploy --legacy --filter @celine-eu/assistant --prod /out


# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /out/ ./

EXPOSE 3003
ENV PORT=3003
ENV HOST=0.0.0.0

CMD ["node", "build"]
