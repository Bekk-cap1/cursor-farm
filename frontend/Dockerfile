# Static SPA + nginx; proxies /api to backend (same host / subdomain in production)
FROM node:22-alpine AS build

ARG VITE_API_ORIGIN=""
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json eslint.config.js ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM nginx:1.27-alpine

# BACKEND_URL — адрес бэкенда для nginx proxy_pass.
# Render: полный URL сервиса (напр. http://cursor-farm-api.onrender.com)
# Docker Compose: http://backend:8000
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx official image поддерживает /etc/nginx/templates/ — envsubst запускается автоматически
CMD ["nginx", "-g", "daemon off;"]
