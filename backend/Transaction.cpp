#include "Transaction.h"
#include <sstream>
#include <vector>

Transaction::Transaction()
    : id(0), reference(""), idempotencyKey(""), compteSource(0), compteDest(-1),
      type(""), operateur("Banque"), detailsCible(""), montant(0), date(""),
      soldeApres(0), statut("EXECUTE"), motif("") {}

Transaction::Transaction(int i, const std::string& ref, const std::string& idemKey,
                         int src, int dest, const std::string& t, const std::string& op,
                         const std::string& details, int64_t m, const std::string& d,
                         int64_t sa, const std::string& st, const std::string& mot)
    : id(i), reference(ref), idempotencyKey(idemKey), compteSource(src), compteDest(dest),
      type(t), operateur(op), detailsCible(details), montant(m), date(d),
      soldeApres(sa), statut(st), motif(mot) {}

std::string Transaction::toLine() const {
    std::ostringstream oss;
    oss << id << "|" << reference << "|" << idempotencyKey << "|"
        << compteSource << "|" << compteDest << "|" << type << "|"
        << operateur << "|" << detailsCible << "|" << montant << "|"
        << date << "|" << soldeApres << "|" << statut << "|" << motif;
    return oss.str();
}

Transaction Transaction::fromLine(const std::string& line) {
    Transaction t;
    std::stringstream ss(line);
    std::string token;
    std::vector<std::string> parts;
    while (std::getline(ss, token, '|')) parts.push_back(token);
    if (parts.size() >= 11) {
        t.id = std::stoi(parts[0]);
        t.reference = parts[1];
        t.idempotencyKey = parts[2];
        t.compteSource = std::stoi(parts[3]);
        t.compteDest = std::stoi(parts[4]);
        t.type = parts[5];
        t.operateur = parts[6];
        t.detailsCible = parts[7];
        t.montant = std::stoll(parts[8]);
        t.date = parts[9];
        t.soldeApres = std::stoll(parts[10]);
        if (parts.size() > 11) t.statut = parts[11];
        if (parts.size() > 12) t.motif = parts[12];
    }
    return t;
}
