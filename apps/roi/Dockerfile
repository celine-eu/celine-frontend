# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Force dev deps in builder regardless of CI env poisoning
ENV NODE_ENV=development
ENV CI=true

COPY . .

# Install ALL deps (including devDependencies)
RUN pnpm install --frozen-lockfile --prod=false

# Build
# Build in production mode. NODE_ENV=development above is for `pnpm install` (dev
# dependencies); left on for the build, Vite emits a development bundle whose client
# chunks read a different `__sveltekit_*` global than the server writes, and every
# page using `$env/dynamic/public` fails with "reading 'env'" in the browser.
RUN NODE_ENV=production pnpm -F @celine-eu/roi build

# Deploy standalone runtime bundle
RUN pnpm deploy --legacy --filter @celine-eu/roi --prod /out


# Runtime stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /out/ ./

EXPOSE 3004
ENV PORT=3004
ENV HOST=0.0.0.0


CMD ["node", "build"]
