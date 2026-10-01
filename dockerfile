# ==========================================
# ÉTAPE 1 : Compilation
# ==========================================
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y g++ cmake make && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY . .

WORKDIR /build/backend
RUN cmake . && make

# ==========================================
# ÉTAPE 2 : Exécution
# ==========================================
FROM ubuntu:22.04

WORKDIR /app

COPY --from=builder /build/backend/minibank .
COPY frontend ./frontend

# Créer le dossier data s'il n'existe pas
RUN mkdir -p ./data

ENV PORT=8080
EXPOSE 8080

CMD ["./minibank"]