#include "Compte.h"
#include <sstream>

Compte::Compte() : numero(0), solde(0.0), actif(true), isAdmin(false) {}

Compte::Compte(int n, const std::string& t, const std::string& p,
               double s, const std::string& tc, bool a, bool admin)
    : numero(n), titulaire(t), pin(p), solde(s),
      typeCompte(tc), actif(a), isAdmin(admin) {}

std::string Compte::toLine() const {
    std::ostringstream oss;
    oss << numero << "|" << titulaire << "|" << pin << "|"
        << solde << "|" << typeCompte << "|" << (actif ? 1 : 0)
        << "|" << (isAdmin ? 1 : 0);
    return oss.str();
}

Compte Compte::fromLine(const std::string& line) {
    Compte c;
    std::stringstream ss(line);
    std::string token;
    std::vector<std::string> parts;
    while (std::getline(ss, token, '|')) parts.push_back(token);
    if (parts.size() >= 6) {
        c.numero = std::stoi(parts[0]);
        c.titulaire = parts[1];
        c.pin = parts[2];
        c.solde = std::stod(parts[3]);
        c.typeCompte = parts[4];
        c.actif = (parts[5] == "1");
        // Rétrocompatibilité : ancien format sans isAdmin
        c.isAdmin = (parts.size() >= 7 && parts[6] == "1");
    }
    return c;
}