FROM golang:1.21.6-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY apps ./apps
COPY libs ./libs

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/master-service ./apps/master-service/cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/master-service /app/master-service

EXPOSE 8080

ENTRYPOINT ["/app/master-service"]
