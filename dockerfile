# ==========================================
# ÉTAPE 1 : Compilation
# ==========================================
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y \
    g++ cmake make pkg-config \
    libpqxx-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

WORKDIR /build/backend
RUN cmake . && make

# ==========================================
# ÉTAPE 2 : Exécution (Image finale)
# ==========================================
FROM ubuntu:22.04

# AJOUT : installer libpqxx-6.4 (runtime) en plus de libpq5
RUN apt-get update && apt-get install -y \
    libpq5 \
    libpqxx-6.4 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/backend/minibank .
COPY frontend ./frontend
RUN mkdir -p ./data

ENV PORT=8080
EXPOSE 8080

CMD ["./minibank"]