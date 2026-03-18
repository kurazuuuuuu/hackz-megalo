FROM golang:1.22.12-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY apps/slave-service ./apps/slave-service
COPY libs ./libs

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/slave-service ./apps/slave-service/cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/slave-service /app/slave-service

EXPOSE 50051

ENTRYPOINT ["/app/slave-service"]
