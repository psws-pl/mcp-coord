# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /workspace

RUN corepack enable

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json

RUN pnpm install --frozen-lockfile --filter @mcp-coord/api...

COPY packages/api ./packages/api

RUN pnpm --filter @mcp-coord/api build
RUN pnpm --filter @mcp-coord/api deploy --legacy --prod /app

FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S app -g 1001 \
    && adduser -S app -u 1001 -G app

COPY --from=builder --chown=1001:1001 /app/ ./

USER 1001:1001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http=require('http');const req=http.get('http://127.0.0.1:3000/health',res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));"

CMD ["node", "dist/main.js"]
