# ── Build stage ────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Cache package dependencies
COPY apps/frontend/package*.json ./
RUN npm ci || npm install

COPY apps/frontend/ ./
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ── Runtime stage ──────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
