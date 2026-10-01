FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y \
    g++ cmake make pkg-config \
    libpqxx-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

WORKDIR /build/backend
RUN cmake . && make

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y libpq5 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/backend/minibank .
COPY frontend ./frontend

ENV PORT=8080
EXPOSE 8080

CMD ["./minibank"]