#ifndef BANQUE_H
#define BANQUE_H

#include "Compte.h"
#include "Transaction.h"
#include <vector>
#include <string>

class Banque {
private:
    std::vector<Compte> comptes;
    std::vector<Transaction> transactions;
    int nextCompteNumero;
    int nextTransactionId;

    std::string currentDate();

public:
    Banque();

    bool chargerDonnees();
    bool sauvegarderComptes();
    bool sauvegarderTransactions();

    Compte* trouverCompte(int numero);
    int creerCompte(const std::string& titulaire, const std::string& pin,
                    const std::string& type, double soldeInitial,
                    int numeroForce = -1, bool isAdmin = false);

    bool modifierCompte(int numero, const std::string& titulaire,
                        const std::string& type);
    bool fermerCompte(int numero);

    // NOUVEAU : suppression admin
    bool supprimerCompte(int numero);
    // NOUVEAU : changement de numéro
    bool changerNumero(int ancienNumero, int nouveauNumero, std::string& msg);

    bool authentifier(int numero, const std::string& pin);

    bool depot(int numero, double montant, std::string& msg);
    bool retrait(int numero, double montant, std::string& msg);
    bool virement(int src, int dest, double montant, std::string& msg);

    std::vector<Transaction> getHistorique(int numero);
    std::vector<Compte> getTousComptes();
    std::vector<Transaction> getToutesTransactions();
    double getSolde(int numero);

    // NOUVEAU : stats globales
    struct Stats {
        int nbComptesTotal;
        int nbComptesActifs;
        double masseTotale;
        int nbTransactions;
    };
    Stats getStats();

    // Initialisation d'un admin par défaut si aucun compte admin n'existe
    void assurerAdminParDefaut();
};

#endif