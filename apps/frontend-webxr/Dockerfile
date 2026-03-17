FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY apps/frontend-webxr/package.json apps/frontend-webxr/pnpm-lock.yaml ./

RUN corepack enable
RUN pnpm install --frozen-lockfile

COPY apps/frontend-webxr/ ./

ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_WS_URL=ws://localhost:8080/ws

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

RUN pnpm exec tsc && pnpm exec vp build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
