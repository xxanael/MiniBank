cmake_minimum_required(VERSION 3.10)
project(MiniBankServer)

set(CMAKE_CXX_STANDARD 17)

# On inclut le dossier courant pour trouver httplib.h et json.hpp
include_directories(.)

add_executable(server main.cpp Banque.cpp) # Ajoute Banque.cpp si tu as un fichier séparé