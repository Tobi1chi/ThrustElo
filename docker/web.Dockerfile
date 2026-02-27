FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY vite.web.config.mjs ./

RUN npm run build:web

FROM nginx:1.27-alpine

COPY docker/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html

EXPOSE 80
