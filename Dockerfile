# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app

# Prisma engines need openssl + ca-certificates on Debian slim.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest + schema before install so the `postinstall: prisma generate`
# script can find prisma/schema.prisma.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install prod deps ONLY, and skip lifecycle scripts so the `postinstall:
# prisma generate` step doesn't run here (prisma CLI is a devDep). We copy
# the already-generated client + engine from the build stage instead.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Reuse the client generated in the build stage — same OS/libc, so the engine
# binary is compatible.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

EXPOSE 4000
CMD ["node", "dist/server.js"]
