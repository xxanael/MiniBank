#ifndef TRANSACTION_H
#define TRANSACTION_H

#include <string>
#include <cstdint>

class Transaction {
public:
    int id;
    std::string reference;           // Ex: TXN-20261125-9821-4401
    std::string idempotencyKey;      // Clé anti-rejeu / anti-doublon
    int compteSource;
    int compteDest;
    std::string type;                // "Virement emis", "Virement recu", "Depot", "Retrait", "Recharge Mobile Money", "Retrait Mobile Money"
    std::string operateur;           // "Orange Money", "MTN MoMo", "Wave", "Moov Money", "Virement Interbancaire"
    std::string detailsCible;        // Numéro de téléphone ou référence tiers
    int64_t montant;                 // Montant en FCFA entier
    std::string date;
    int64_t soldeApres;              // Solde en FCFA entier
    std::string statut;              // "EXECUTE", "REJETE"
    std::string motif;               // Description / Libellé

    Transaction();
    Transaction(int id, const std::string& ref, const std::string& idemKey,
                int src, int dest, const std::string& type, const std::string& op,
                const std::string& details, int64_t montant, const std::string& date,
                int64_t soldeApres, const std::string& statut = "EXECUTE",
                const std::string& motif = "");

    std::string toLine() const;
    static Transaction fromLine(const std::string& line);
};

#endif
