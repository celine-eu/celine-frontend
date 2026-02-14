# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Force dev deps in builder regardless of CI env poisoning
ENV CI=true
ENV NODE_ENV=development

COPY . .

# Install ALL deps (including devDependencies)
RUN pnpm install --frozen-lockfile --prod=false

# Build
RUN pnpm -F @celine-eu/assistant build

# Deploy standalone runtime bundle
RUN pnpm deploy --legacy --filter @celine-eu/webapp --prod /out


# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /out/ ./

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "build"]
