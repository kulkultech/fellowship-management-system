# ── Build stage ────────────────────────────────────────
FROM golang:1.25-alpine AS build
WORKDIR /src

# Cache Go dependencies
COPY apps/backend/go.mod apps/backend/go.sum ./
RUN go mod download

COPY apps/backend/ ./
# Static, stripped binary for minimal runtime image
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ── Runtime stage ──────────────────────────────────────
FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 appuser
USER appuser
WORKDIR /app
COPY --from=build /out/api /app/api

EXPOSE 8080
ENTRYPOINT ["/app/api"]
