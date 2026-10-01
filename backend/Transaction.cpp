#include "Transaction.h"
#include <sstream>
#include <vector>

Transaction::Transaction() : id(0), compteSource(0), compteDest(-1),
    montant(0.0), soldeApres(0.0) {}

Transaction::Transaction(int i, int src, int dest, const std::string& t,
                         double m, const std::string& d, double sa)
    : id(i), compteSource(src), compteDest(dest), type(t),
      montant(m), date(d), soldeApres(sa) {}

std::string Transaction::toLine() const {
    std::ostringstream oss;
    oss << id << "|" << compteSource << "|" << compteDest << "|"
        << type << "|" << montant << "|" << date << "|" << soldeApres;
    return oss.str();
}

Transaction Transaction::fromLine(const std::string& line) {
    Transaction t;
    std::stringstream ss(line);
    std::string token;
    std::vector<std::string> parts;
    while (std::getline(ss, token, '|')) parts.push_back(token);
    if (parts.size() >= 7) {
        t.id = std::stoi(parts[0]);
        t.compteSource = std::stoi(parts[1]);
        t.compteDest = std::stoi(parts[2]);
        t.type = parts[3];
        t.montant = std::stod(parts[4]);
        t.date = parts[5];
        t.soldeApres = std::stod(parts[6]);
    }
    return t;
}