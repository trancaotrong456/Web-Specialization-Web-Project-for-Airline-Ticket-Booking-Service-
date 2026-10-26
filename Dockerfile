FROM node:20-alpine AS runtime-dependencies

WORKDIR /app
COPY package*.json ./
# sequelize-cli is a runtime dependency because the documented container
# startup applies forward migrations before starting the API.
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine

WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

COPY --from=runtime-dependencies --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package*.json ./
COPY --chown=app:app . .

ENV NODE_ENV=production
ENV PORT=5000
USER app

EXPOSE 5000

CMD ["sh", "-c", "node scripts/migrate.js --env production && node server.js"]
