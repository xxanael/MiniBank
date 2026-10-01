#ifndef BANQUE_H
#define BANQUE_H

#include "Compte.h"
#include "Transaction.h"
#include <vector>
#include <string>
#include <memory>
#include <pqxx/pqxx>

class Banque {
private:
    std::vector<Compte> comptes;
    std::vector<Transaction> transactions;
    int nextCompteNumero;
    int nextTransactionId;
    
    // Connexion PostgreSQL
    std::unique_ptr<pqxx::connection> conn;
    
    std::string currentDate();
    
    // Initialisation de la base
    void initDB();
    void chargerDepuisDB();
    void assurerAdminParDefaut();
    
    // Sauvegarde (écrit dans la DB)
    void sauvegarderCompte(const Compte& c);
    void sauvegarderTransaction(const Transaction& t);
    void mettreAJourCompte(const Compte& c);
    void supprimerCompteDB(int numero);

public:
    Banque();
    ~Banque();

    bool chargerDonnees();  // Charge depuis PostgreSQL
    Compte* trouverCompte(int numero);
    
    int creerCompte(const std::string& titulaire, const std::string& pin,
                    const std::string& type, double soldeInitial,
                    int numeroForce = -1, bool isAdmin = false);
    bool modifierCompte(int numero, const std::string& titulaire, const std::string& type);
    bool fermerCompte(int numero);
    bool supprimerCompte(int numero);
    bool changerNumero(int ancienNumero, int nouveauNumero, std::string& msg);
    
    bool authentifier(int numero, const std::string& pin);
    bool depot(int numero, double montant, std::string& msg);
    bool retrait(int numero, double montant, std::string& msg);
    bool virement(int src, int dest, double montant, std::string& msg);
    
    std::vector<Transaction> getHistorique(int numero);
    std::vector<Compte> getTousComptes();
    std::vector<Transaction> getToutesTransactions();
    double getSolde(int numero);
    
    struct Stats {
        int nbComptesTotal;
        int nbComptesActifs;
        double masseTotale;
        int nbTransactions;
    };
    Stats getStats();
};

#endif