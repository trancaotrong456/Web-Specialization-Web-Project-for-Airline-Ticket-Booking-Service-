FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# sequelize-cli is used by the demo container to apply migrations before startup.
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV PORT=5000

EXPOSE 5000

CMD ["sh", "-c", "npx sequelize-cli db:migrate && node server.js"]
