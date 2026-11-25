#ifndef COMPTE_H
#define COMPTE_H

#include <string>
#include <vector>
#include <cstdint>

class Compte {
public:
    int numero;
    std::string titulaire;
    std::string pinHash;
    std::string pinSalt;
    int64_t solde;                     // Montant en entiers stricts (FCFA)
    std::string devise;                // "FCFA"
    std::string typeCompte;            // "Courant", "Epargne", "Pro"
    bool actif;
    bool isAdmin;
    std::string role;                  // "CLIENT", "ADMIN"
    bool mfaEnabled;
    std::string mfaSecret;
    int failedAttempts;                // Protection anti-brute force
    std::string lockedUntil;           // Date jusqu'à laquelle le compte est bloqué
    int64_t limiteVirementJour;        // Plafond journalier de virement (ex: 1 000 000 FCFA)
    std::string dateCreation;

    Compte();
    Compte(int numero, const std::string& titulaire, const std::string& pinHash, const std::string& pinSalt,
           int64_t solde, const std::string& type, bool actif, bool isAdmin = false,
           bool mfaEnabled = false, const std::string& mfaSecret = "",
           const std::string& role = "CLIENT", int failedAttempts = 0,
           const std::string& lockedUntil = "", int64_t limiteVirementJour = 1000000,
           const std::string& devise = "FCFA", const std::string& dateCreation = "");

    std::string toLine() const;
    static Compte fromLine(const std::string& line);
};

#endif
