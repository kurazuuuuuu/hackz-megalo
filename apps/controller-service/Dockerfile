FROM golang:1.22.12-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY apps ./apps
COPY libs ./libs

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/controller-service ./apps/controller-service/cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/controller-service /app/controller-service

ENTRYPOINT ["/app/controller-service"]
