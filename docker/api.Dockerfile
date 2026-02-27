FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server ./server
COPY src/shared ./src/shared

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/src/index.mjs"]
