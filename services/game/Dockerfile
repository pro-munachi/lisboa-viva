FROM golang:1.26.0-alpine AS build
WORKDIR /build
COPY services/game/go.mod services/game/go.sum ./
RUN go mod download
COPY services/game/ ./
RUN CGO_ENABLED=0 go build -o /game .

FROM alpine:3.23
RUN adduser -D -u 10001 game
WORKDIR /app
COPY --from=build /game /app/game
COPY db /app/db
USER game
EXPOSE 8080
ENTRYPOINT ["/app/game"]
