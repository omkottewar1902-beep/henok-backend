FROM node:20-alpine AS build
WORKDIR /app

# Install with dev deps so tsc + prisma CLI are available.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only prod deps in the final image.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma engine files, schema (needed for `migrate deploy`), compiled JS,
# and the static "SCAN & CALL" page.
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# Non-root runtime user. The base image ships a `node` user (uid 1000) already.
RUN mkdir -p public/uploads && chown -R node:node /app
USER node

EXPOSE 4000

# Apply any pending migrations before booting the API. `migrate deploy` never
# generates new migrations and is safe to run on every start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
