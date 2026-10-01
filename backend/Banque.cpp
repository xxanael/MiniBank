#include "Banque.h"
#include <fstream>
#include <sstream>
#include <ctime>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <iostream>

Banque::Banque() : nextCompteNumero(1000), nextTransactionId(1) {
    chargerDonnees();
    assurerAdminParDefaut();
}

std::string Banque::currentDate() {
    std::time_t t = std::time(nullptr);
    std::tm* tm = std::localtime(&t);
    std::ostringstream oss;
    oss << std::put_time(tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

bool Banque::chargerDonnees() {
    comptes.clear();
    transactions.clear();

    std::ifstream fc("data/comptes.txt");
    std::string line;
    while (std::getline(fc, line)) {
        if (line.empty()) continue;
        Compte c = Compte::fromLine(line);
        comptes.push_back(c);
        if (c.numero >= nextCompteNumero) nextCompteNumero = c.numero + 1;
    }
    fc.close();

    std::ifstream ft("data/transactions.txt");
    while (std::getline(ft, line)) {
        if (line.empty()) continue;
        Transaction t = Transaction::fromLine(line);
        transactions.push_back(t);
        if (t.id >= nextTransactionId) nextTransactionId = t.id + 1;
    }
    ft.close();
    return true;
}

bool Banque::sauvegarderComptes() {
    std::ofstream f("data/comptes.txt");
    if (!f.is_open()) return false;
    for (const auto& c : comptes) f << c.toLine() << "\n";
    return true;
}

bool Banque::sauvegarderTransactions() {
    std::ofstream f("data/transactions.txt");
    if (!f.is_open()) return false;
    for (const auto& t : transactions) f << t.toLine() << "\n";
    return true;
}

Compte* Banque::trouverCompte(int numero) {
    for (auto& c : comptes)
        if (c.numero == numero) return &c;
    return nullptr;
}

// Vérifie qu'un numéro est unique
static bool numeroExiste(const std::vector<Compte>& comptes, int numero) {
    for (const auto& c : comptes)
        if (c.numero == numero) return true;
    return false;
}

int Banque::creerCompte(const std::string& titulaire, const std::string& pin,
                        const std::string& type, double soldeInitial,
                        int numeroForce, bool isAdmin) {
    if (pin.length() != 4) return -1;
    if (titulaire.empty()) return -1;
    if (soldeInitial < 0) soldeInitial = 0;

    int num;
    if (numeroForce > 0) {
        // Numéro imposé (par l'admin)
        if (numeroExiste(comptes, numeroForce)) return -2; // déjà pris
        num = numeroForce;
        if (num >= nextCompteNumero) nextCompteNumero = num + 1;
    } else {
        // Auto-généré
        num = nextCompteNumero++;
        while (numeroExiste(comptes, num)) num = nextCompteNumero++;
    }

    Compte c(num, titulaire, pin, soldeInitial, type, true, isAdmin);
    comptes.push_back(c);

    if (soldeInitial > 0) {
        Transaction t(nextTransactionId++, num, -1, "Depot initial",
                      soldeInitial, currentDate(), soldeInitial);
        transactions.push_back(t);
        sauvegarderTransactions();
    }
    sauvegarderComptes();
    return num;
}

bool Banque::modifierCompte(int numero, const std::string& titulaire,
                            const std::string& type) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    if (!titulaire.empty()) c->titulaire = titulaire;
    if (!type.empty()) c->typeCompte = type;
    sauvegarderComptes();
    return true;
}

bool Banque::fermerCompte(int numero) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    if (std::fabs(c->solde) > 0.001) return false;
    c->actif = false;
    sauvegarderComptes();
    return true;
}

// NOUVEAU : suppression complète (admin)
bool Banque::supprimerCompte(int numero) {
    auto it = std::find_if(comptes.begin(), comptes.end(),
        [numero](const Compte& c) { return c.numero == numero; });
    if (it == comptes.end()) return false;
    comptes.erase(it);
    sauvegarderComptes();
    return true;
}

// NOUVEAU : changer le numéro d'un compte
bool Banque::changerNumero(int ancienNumero, int nouveauNumero, std::string& msg) {
    if (nouveauNumero <= 0) { msg = "Numero invalide"; return false; }
    if (ancienNumero == nouveauNumero) { msg = "Identique"; return false; }
    Compte* c = trouverCompte(ancienNumero);
    if (!c) { msg = "Compte introuvable"; return false; }
    if (numeroExiste(comptes, nouveauNumero)) {
        msg = "Numero deja utilise"; return false;
    }

    // Mettre à jour les transactions pour préserver la cohérence
    for (auto& t : transactions) {
        if (t.compteSource == ancienNumero) t.compteSource = nouveauNumero;
        if (t.compteDest == ancienNumero) t.compteDest = nouveauNumero;
    }

    c->numero = nouveauNumero;
    if (nouveauNumero >= nextCompteNumero) nextCompteNumero = nouveauNumero + 1;

    sauvegarderComptes();
    sauvegarderTransactions();
    msg = "Numero modifie";
    return true;
}

bool Banque::authentifier(int numero, const std::string& pin) {
    Compte* c = trouverCompte(numero);
    return c && c->actif && c->pin == pin;
}

bool Banque::depot(int numero, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) {
        msg = "Montant invalide"; return false;
    }
    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    c->solde += montant;
    Transaction t(nextTransactionId++, numero, -1, "Depot",
                  montant, currentDate(), c->solde);
    transactions.push_back(t);
    sauvegarderComptes();
    sauvegarderTransactions();
    msg = "Depot reussi";
    return true;
}

bool Banque::retrait(int numero, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) {
        msg = "Montant invalide"; return false;
    }
    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    if (c->solde < montant) { msg = "Solde insuffisant"; return false; }
    c->solde -= montant;
    Transaction t(nextTransactionId++, numero, -1, "Retrait",
                  montant, currentDate(), c->solde);
    transactions.push_back(t);
    sauvegarderComptes();
    sauvegarderTransactions();
    msg = "Retrait reussi";
    return true;
}

bool Banque::virement(int src, int dest, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) {
        msg = "Montant invalide"; return false;
    }
    if (src == dest) { msg = "Comptes identiques"; return false; }
    Compte* cs = trouverCompte(src);
    Compte* cd = trouverCompte(dest);
    if (!cs || !cs->actif) { msg = "Compte source invalide"; return false; }
    if (!cd || !cd->actif) { msg = "Compte destinataire invalide"; return false; }
    if (cs->solde < montant) { msg = "Solde insuffisant"; return false; }

    cs->solde -= montant;
    cd->solde += montant;

    Transaction t1(nextTransactionId++, src, dest, "Virement emis",
                   montant, currentDate(), cs->solde);
    Transaction t2(nextTransactionId++, dest, src, "Virement recu",
                   montant, currentDate(), cd->solde);
    transactions.push_back(t1);
    transactions.push_back(t2);

    sauvegarderComptes();
    sauvegarderTransactions();
    msg = "Virement reussi";
    return true;
}

std::vector<Transaction> Banque::getHistorique(int numero) {
    std::vector<Transaction> result;
    for (const auto& t : transactions)
        if (t.compteSource == numero) result.push_back(t);
    std::reverse(result.begin(), result.end());
    return result;
}

std::vector<Compte> Banque::getTousComptes() {
    return comptes;
}

std::vector<Transaction> Banque::getToutesTransactions() {
    std::vector<Transaction> result = transactions;
    std::reverse(result.begin(), result.end());
    return result;
}

double Banque::getSolde(int numero) {
    Compte* c = trouverCompte(numero);
    return c ? c->solde : -1;
}

Banque::Stats Banque::getStats() {
    Stats s;
    s.nbComptesTotal = (int)comptes.size();
    s.nbComptesActifs = 0;
    s.masseTotale = 0.0;
    for (const auto& c : comptes) {
        if (c.actif) s.nbComptesActifs++;
        s.masseTotale += c.solde;
    }
    s.nbTransactions = (int)transactions.size();
    return s;
}

void Banque::assurerAdminParDefaut() {
    // Vérifie s'il existe déjà un admin
    for (const auto& c : comptes)
        if (c.isAdmin) return;

    // Crée un admin par défaut : numéro 9999, PIN 0000
    Compte admin(9999, "ADMIN", "0000", 0.0, "Admin", true, true);
    // Évite le doublon
    if (!trouverCompte(9999)) {
        comptes.push_back(admin);
        sauvegarderComptes();
        std::cout << "[INFO] Compte admin par defaut cree : numero 9999, PIN 0000\n";
    }
}