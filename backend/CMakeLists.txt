cmake_minimum_required(VERSION 3.10)
project(MiniBank)

set(CMAKE_CXX_STANDARD 17)

# Inclure le dossier courant pour les headers (httplib.h, json.hpp, Banque.h)
include_directories(${CMAKE_CURRENT_SOURCE_DIR})

# Trouver automatiquement tous les fichiers .cpp du dossier
file(GLOB SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp")

# Créer l'exécutable avec tous les .cpp trouvés
add_executable(minibank ${SOURCES})