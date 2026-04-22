FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web/package.json packages/web/package.json

RUN pnpm install --frozen-lockfile

COPY packages/web ./packages/web

RUN pnpm --filter @mcp-coord/web build

FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN addgroup -S app -g 1001 \
  && adduser -S app -u 1001 -G app

COPY --from=builder --chown=1001:1001 /app/packages/web/public ./packages/web/public
COPY --from=builder --chown=1001:1001 /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder --chown=1001:1001 /app/packages/web/.next/standalone ./

USER 1001:1001

EXPOSE 3000

CMD ["node", "packages/web/server.js"]
