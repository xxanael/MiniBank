#include "Compte.h"
#include <sstream>

Compte::Compte()
    : numero(0), solde(0), devise("FCFA"), typeCompte("Courant"), actif(true),
      isAdmin(false), role("CLIENT"), mfaEnabled(false), mfaSecret(""),
      failedAttempts(0), lockedUntil(""), limiteVirementJour(1000000), dateCreation("") {}

Compte::Compte(int n, const std::string& t, const std::string& ph, const std::string& ps,
               int64_t s, const std::string& tc, bool a, bool admin,
               bool mfa, const std::string& sec, const std::string& r,
               int fa, const std::string& lu, int64_t lim, const std::string& dev, const std::string& dc)
    : numero(n), titulaire(t), pinHash(ph), pinSalt(ps), solde(s), devise(dev),
      typeCompte(tc), actif(a), isAdmin(admin), role(r), mfaEnabled(mfa), mfaSecret(sec),
      failedAttempts(fa), lockedUntil(lu), limiteVirementJour(lim), dateCreation(dc) {}

std::string Compte::toLine() const {
    std::ostringstream oss;
    oss << numero << "|" << titulaire << "|" << pinHash << "|" << pinSalt << "|"
        << solde << "|" << typeCompte << "|" << (actif ? 1 : 0) << "|"
        << (isAdmin ? 1 : 0) << "|" << (mfaEnabled ? 1 : 0) << "|" << mfaSecret << "|"
        << role << "|" << failedAttempts << "|" << lockedUntil << "|" << limiteVirementJour << "|" << devise;
    return oss.str();
}

Compte Compte::fromLine(const std::string& line) {
    Compte c;
    std::stringstream ss(line);
    std::string token;
    std::vector<std::string> parts;
    while (std::getline(ss, token, '|')) parts.push_back(token);
    if (parts.size() >= 5) {
        c.numero = std::stoi(parts[0]);
        c.titulaire = parts[1];
        c.pinHash = parts[2];
        c.pinSalt = parts.size() > 3 ? parts[3] : "";
        c.solde = std::stoll(parts[4]);
        if (parts.size() > 5) c.typeCompte = parts[5];
        if (parts.size() > 6) c.actif = (parts[6] == "1");
        if (parts.size() > 7) c.isAdmin = (parts[7] == "1");
        if (parts.size() > 8) c.mfaEnabled = (parts[8] == "1");
        if (parts.size() > 9) c.mfaSecret = parts[9];
        if (parts.size() > 10) c.role = parts[10];
        if (parts.size() > 11) c.failedAttempts = std::stoi(parts[11]);
        if (parts.size() > 12) c.lockedUntil = parts[12];
        if (parts.size() > 13) c.limiteVirementJour = std::stoll(parts[13]);
        if (parts.size() > 14) c.devise = parts[14];
    }
    return c;
}
