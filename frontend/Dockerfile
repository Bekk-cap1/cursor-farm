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

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
