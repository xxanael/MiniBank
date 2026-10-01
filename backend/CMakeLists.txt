cmake_minimum_required(VERSION 3.10)
project(MiniBank)

set(CMAKE_CXX_STANDARD 17)

# Trouver libpqxx et libpq
find_package(PkgConfig REQUIRED)
pkg_check_modules(PQXX REQUIRED libpqxx)
pkg_check_modules(PQ REQUIRED libpq)

include_directories(${PQXX_INCLUDE_DIRS} ${PQ_INCLUDE_DIRS} ${CMAKE_CURRENT_SOURCE_DIR})

file(GLOB SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp")

add_executable(minibank ${SOURCES})

target_link_libraries(minibank ${PQXX_LIBRARIES} ${PQ_LIBRARIES})