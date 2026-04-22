# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN corepack enable

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/runner/package.json packages/runner/package.json

RUN pnpm install --frozen-lockfile --filter @mcp-coord/runner...

COPY packages/runner ./packages/runner

RUN pnpm --filter @mcp-coord/runner build
RUN pnpm --filter @mcp-coord/runner deploy --legacy --prod /app

FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S app -g 1001 \
    && adduser -S app -u 1001 -G app

COPY --from=builder --chown=1001:1001 /app/package.json ./package.json
COPY --from=builder --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /app/dist ./dist

USER 1001:1001

CMD ["node", "dist/index.js"]
