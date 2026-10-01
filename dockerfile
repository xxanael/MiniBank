# ==========================================
# ÉTAPE 1 : Compilation (Machine puissante)
# ==========================================
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y g++ cmake make && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# On copie tout le projet (backend, frontend, data)
COPY . .

# On va dans le backend pour compiler
WORKDIR /build/backend
RUN cmake . && make

# ==========================================
# ÉTAPE 2 : Exécution (Machine légère)
# ==========================================
FROM ubuntu:22.04

WORKDIR /app

# 1. On copie l'exécutable compilé (nommé 'server' selon le CMakeLists)
COPY --from=builder /build/backend/server .

# 2. On copie le dossier frontend (pour que svr.set_mount_point("/", "./frontend") fonctionne)
COPY frontend ./frontend

# 3. On copie le dossier data (pour que ton programme trouve comptes.txt, etc.)
COPY data ./data

# Render injecte la variable PORT automatiquement
ENV PORT=8080

# On expose le port
EXPOSE 8080

# On lance le serveur
CMD ["./server"]