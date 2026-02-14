# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy manifests needed by webapp (add any workspace deps webapp uses)
COPY packages/ui/package.json packages/ui/package.json
COPY packages/assistant-ui/package.json packages/assistant-ui/package.json
COPY apps/webapp/package.json apps/webapp/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/webapp ./apps/webapp

RUN pnpm -F @celine-eu/webapp build
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
