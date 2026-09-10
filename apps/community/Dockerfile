FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

ENV NODE_ENV=development
ENV CI=true

COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm -F @celine-eu/community build
RUN pnpm deploy --legacy --filter @celine-eu/community --prod /out

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3007
ENV HOST=0.0.0.0

COPY --from=builder /out/ ./

EXPOSE 3007
CMD ["node", "build"]
