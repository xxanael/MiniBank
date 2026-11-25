#ifndef BANQUE_H
#define BANQUE_H

#include "Compte.h"
#include "Transaction.h"
#include "Beneficiaire.h"
#include "AuditLog.h"
#include "Crypto.h"
#include <vector>
#include <string>
#include <memory>
#include <cstdint>
#include <pqxx/pqxx>

enum class AuthResult {
    SUCCESS,
    INVALID_CREDENTIALS,
    ACCOUNT_LOCKED,
    ACCOUNT_INACTIVE,
    NOT_FOUND
};

class Banque {
private:
    std::vector<Compte> comptes;
    std::vector<Transaction> transactions;
    std::vector<Beneficiaire> beneficiaires;
    std::vector<AuditLog> auditLogs;
    int nextTransactionId;
    int nextBeneficiaireId;
    int nextAuditLogId;
    
    // Connexion PostgreSQL
    std::unique_ptr<pqxx::connection> conn;
    
    std::string currentDate();
    std::string addMinutesToDate(int minutes);
    bool isDatePassed(const std::string& dateIso);
    
    // Initialisation et persistance DB
    void initDB();
    void chargerDepuisDB();
    void assurerAdminParDefaut();
    
    void sauvegarderCompte(const Compte& c);
    void mettreAJourCompte(const Compte& c);
    void supprimerCompteDB(int numero);
    void sauvegarderTransaction(const Transaction& t);
    void sauvegarderBeneficiaire(const Beneficiaire& b);
    void supprimerBeneficiaireDB(int id);
    void sauvegarderAuditLog(const AuditLog& log);

public:
    Banque();
    ~Banque();

    bool chargerDonnees();
    Compte* trouverCompte(int numero);
    Transaction* trouverTransaction(int id);
    Transaction* trouverTransactionParRef(const std::string& ref);
    Transaction* trouverTransactionParIdempotencyKey(const std::string& key);

    // Gestion des comptes
    int creerCompte(const std::string& titulaire, const std::string& pin,
                    const std::string& type, int64_t soldeInitial,
                    int numeroForce = -1, bool isAdmin = false,
                    const std::string& role = "CLIENT");
    bool modifierCompte(int numero, const std::string& titulaire, const std::string& type);
    bool fermerCompte(int numero);
    bool supprimerCompte(int numero);
    bool setCompteStatut(int numero, bool actif, std::string& msg);
    bool changerNumero(int ancienNumero, int nouveauNumero, std::string& msg);
    
    // Authentification robuste anti-brute force
    AuthResult authentifier(int numero, const std::string& pin, std::string& msg);
    bool changerPin(int numero, const std::string& ancienPin, const std::string& nouveauPin, std::string& msg);

    // 2FA / MFA
    bool activerMFA(int numero, const std::string& secret);
    bool desactiverMFA(int numero);
    bool estMFAActif(int numero);
    std::string getMFASecret(int numero);

    // Opérations financières atomiques ACID (en FCFA entiers)
    bool depot(int numero, int64_t montant, std::string& msg, const std::string& idempotencyKey = "");
    bool retrait(int numero, int64_t montant, std::string& msg, const std::string& idempotencyKey = "");
    bool virement(int src, int dest, int64_t montant, std::string& msg,
                  const std::string& motif = "", const std::string& idempotencyKey = "");
    
    // Mobile Money
    bool rechargeMobileMoney(int numero, const std::string& operateur, const std::string& telephone,
                            int64_t montant, std::string& msg, const std::string& idempotencyKey = "");
    bool retraitMobileMoney(int numero, const std::string& operateur, const std::string& telephone,
                           int64_t montant, std::string& msg, const std::string& idempotencyKey = "");

    // Bénéficiaires
    bool ajouterBeneficiaire(int proprietaire, int compteCible, const std::string& alias, const std::string& email, std::string& msg);
    bool supprimerBeneficiaire(int proprietaire, int beneficiaireIdOuNumero);
    std::vector<Beneficiaire> getBeneficiaires(int proprietaire);
    std::string getDerniereReference(int numero);

    // Journal d'audit
    void logAudit(int compteNumero, const std::string& eventType, const std::string& desc,
                  const std::string& ip = "", const std::string& status = "SUCCESS");
    std::vector<AuditLog> getAuditLogs(int compteNumero = -1, int limit = 100);

    // Historique & Filtres avancés
    std::vector<Transaction> getHistorique(int numero);
    std::vector<Transaction> filtrerHistorique(int numero, const std::string& type = "",
                                              int64_t montantMin = 0, int64_t montantMax = 0,
                                              const std::string& statut = "");
    std::vector<Compte> getTousComptes();
    std::vector<Transaction> getToutesTransactions();
    int64_t getSolde(int numero);
    int64_t getSommeVirementsAujourdhui(int numero);

    struct Stats {
        int nbComptesTotal;
        int nbComptesActifs;
        int64_t masseTotale;
        int nbTransactions;
    };
    Stats getStats();
};

#endif
