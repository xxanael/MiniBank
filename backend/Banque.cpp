#include "Banque.h"
#include <sstream>
#include <ctime>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <cstdlib>

std::string Banque::currentDate() {
    std::time_t t = std::time(nullptr);
    std::tm* tm = std::localtime(&t);
    std::ostringstream oss;
    oss << std::put_time(tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

Banque::Banque() : nextCompteNumero(1000), nextTransactionId(1) {
    // Lire DATABASE_URL depuis l'environnement (Render) ou valeur par défaut
    const char* dbUrl = std::getenv("DATABASE_URL");
    std::string url = dbUrl ? dbUrl : "postgresql://localhost:5432/minibank";
    
    try {
        conn = std::make_unique<pqxx::connection>(url);
        std::cout << "[DB] Connecté à PostgreSQL" << std::endl;
        initDB();
        chargerDepuisDB();
        assurerAdminParDefaut();
    } catch (const std::exception& e) {
        std::cerr << "[DB] ERREUR de connexion: " << e.what() << std::endl;
        throw;
    }
}

Banque::~Banque() {
    
}

void Banque::initDB() {
    pqxx::work txn(*conn);
    txn.exec(R"(
        CREATE TABLE IF NOT EXISTS comptes (
            numero INTEGER PRIMARY KEY,
            titulaire VARCHAR(100) NOT NULL,
            pin VARCHAR(4) NOT NULL,
            solde DECIMAL(15, 2) DEFAULT 0.00,
            typeCompte VARCHAR(20) DEFAULT 'Courant',
            actif BOOLEAN DEFAULT TRUE,
            isAdmin BOOLEAN DEFAULT FALSE,
            dateCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            compteSource INTEGER,
            compteDest INTEGER,
            type VARCHAR(30) NOT NULL,
            montant DECIMAL(15, 2) NOT NULL,
            soldeApres DECIMAL(15, 2),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE SEQUENCE IF NOT EXISTS transaction_id_seq START WITH 1;
    )");
    txn.commit();
    std::cout << "[DB] Tables créées/vérifiées" << std::endl;
}

void Banque::chargerDepuisDB() {
    comptes.clear();
    transactions.clear();
    
    pqxx::work txn(*conn);
    
    // Charger les comptes
    pqxx::result resComptes = txn.exec("SELECT numero, titulaire, pin, solde, typeCompte, actif, isAdmin FROM comptes ORDER BY numero");
    for (const auto& row : resComptes) {
        Compte c(
            row["numero"].as<int>(),
            row["titulaire"].as<std::string>(),
            row["pin"].as<std::string>(),
            row["solde"].as<double>(),
            row["typecompte"].as<std::string>(),
            row["actif"].as<bool>(),
            row["isadmin"].as<bool>()
        );
        comptes.push_back(c);
        if (c.numero >= nextCompteNumero) nextCompteNumero = c.numero + 1;
    }
    
    // Charger les transactions
    pqxx::result resTrans = txn.exec("SELECT id, comptesource, comptedest, type, montant, soldeapres, date FROM transactions ORDER BY id");
    for (const auto& row : resTrans) {
        Transaction t(
            row["id"].as<int>(),
            row["comptesource"].is_null() ? -1 : row["comptesource"].as<int>(),
            row["comptedest"].is_null() ? -1 : row["comptedest"].as<int>(),
            row["type"].as<std::string>(),
            row["montant"].as<double>(),
            row["date"].as<std::string>(),
            row["soldeapres"].is_null() ? 0.0 : row["soldeapres"].as<double>()
        );
        transactions.push_back(t);
        if (t.id >= nextTransactionId) nextTransactionId = t.id + 1;
    }
    
    std::cout << "[DB] " << comptes.size() << " comptes et " << transactions.size() << " transactions chargés" << std::endl;
}

void Banque::assurerAdminParDefaut() {
    for (const auto& c : comptes) {
        if (c.isAdmin) return;
    }
    
    Compte admin(9999, "ADMIN", "0000", 0.0, "Admin", true, true);
    comptes.push_back(admin);
    sauvegarderCompte(admin);
    std::cout << "[INFO] Compte admin par defaut cree : numero 9999, PIN 0000" << std::endl;
}

void Banque::sauvegarderCompte(const Compte& c) {
    pqxx::work txn(*conn);
    txn.exec_params(
        "INSERT INTO comptes (numero, titulaire, pin, solde, typeCompte, actif, isAdmin) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) "
        "ON CONFLICT (numero) DO UPDATE SET "
        "titulaire = $2, pin = $3, solde = $4, typeCompte = $5, actif = $6, isAdmin = $7",
        c.numero, c.titulaire, c.pin, c.solde, c.typeCompte, c.actif, c.isAdmin
    );
    txn.commit();
}

void Banque::mettreAJourCompte(const Compte& c) {
    pqxx::work txn(*conn);
    txn.exec_params(
        "UPDATE comptes SET titulaire = $1, pin = $2, solde = $3, typeCompte = $4, actif = $5, isAdmin = $6 WHERE numero = $7",
        c.titulaire, c.pin, c.solde, c.typeCompte, c.actif, c.isAdmin, c.numero
    );
    txn.commit();
}

void Banque::supprimerCompteDB(int numero) {
    pqxx::work txn(*conn);
    txn.exec_params("DELETE FROM comptes WHERE numero = $1", numero);
    txn.commit();
}

void Banque::sauvegarderTransaction(const Transaction& t) {
    pqxx::work txn(*conn);
    txn.exec_params(
        "INSERT INTO transactions (id, compteSource, compteDest, type, montant, soldeApres, date) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        t.id, t.compteSource, t.compteDest, t.type, t.montant, t.soldeApres, t.date
    );
    txn.commit();
}

bool Banque::chargerDonnees() {
    chargerDepuisDB();
    return true;
}

Compte* Banque::trouverCompte(int numero) {
    for (auto& c : comptes)
        if (c.numero == numero) return &c;
    return nullptr;
}

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
        if (numeroExiste(comptes, numeroForce)) return -2;
        num = numeroForce;
        if (num >= nextCompteNumero) nextCompteNumero = num + 1;
    } else {
        num = nextCompteNumero++;
        while (numeroExiste(comptes, num)) num = nextCompteNumero++;
    }
    
    Compte c(num, titulaire, pin, soldeInitial, type, true, isAdmin);
    comptes.push_back(c);
    sauvegarderCompte(c);
    
    if (soldeInitial > 0) {
        Transaction t(nextTransactionId++, num, -1, "Depot initial",
                      soldeInitial, currentDate(), soldeInitial);
        transactions.push_back(t);
        sauvegarderTransaction(t);
    }
    
    return num;
}

bool Banque::modifierCompte(int numero, const std::string& titulaire, const std::string& type) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    
    if (!titulaire.empty()) c->titulaire = titulaire;
    if (!type.empty()) c->typeCompte = type;
    
    mettreAJourCompte(*c);
    return true;
}

bool Banque::fermerCompte(int numero) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    if (std::fabs(c->solde) > 0.001) return false;
    
    c->actif = false;
    mettreAJourCompte(*c);
    return true;
}

bool Banque::supprimerCompte(int numero) {
    auto it = std::find_if(comptes.begin(), comptes.end(),
        [numero](const Compte& c) { return c.numero == numero; });
    if (it == comptes.end()) return false;
    
    comptes.erase(it);
    supprimerCompteDB(numero);
    return true;
}

bool Banque::changerNumero(int ancienNumero, int nouveauNumero, std::string& msg) {
    if (nouveauNumero <= 0) { msg = "Numero invalide"; return false; }
    if (ancienNumero == nouveauNumero) { msg = "Identique"; return false; }
    
    Compte* c = trouverCompte(ancienNumero);
    if (!c) { msg = "Compte introuvable"; return false; }
    if (numeroExiste(comptes, nouveauNumero)) { msg = "Numero deja utilise"; return false; }
    
    // Mettre à jour les transactions dans la DB
    pqxx::work txn(*conn);
    txn.exec_params("UPDATE transactions SET compteSource = $1 WHERE compteSource = $2", nouveauNumero, ancienNumero);
    txn.exec_params("UPDATE transactions SET compteDest = $1 WHERE compteDest = $2", nouveauNumero, ancienNumero);
    txn.commit();
    
    // Mettre à jour en mémoire
    for (auto& t : transactions) {
        if (t.compteSource == ancienNumero) t.compteSource = nouveauNumero;
        if (t.compteDest == ancienNumero) t.compteDest = nouveauNumero;
    }
    
    c->numero = nouveauNumero;
    if (nouveauNumero >= nextCompteNumero) nextCompteNumero = nouveauNumero + 1;
    sauvegarderCompte(*c);
    
    msg = "Numero modifie";
    return true;
}

bool Banque::authentifier(int numero, const std::string& pin) {
    Compte* c = trouverCompte(numero);
    return c && c->actif && c->pin == pin;
}

bool Banque::depot(int numero, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) { msg = "Montant invalide"; return false; }
    
    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    
    c->solde += montant;
    mettreAJourCompte(*c);
    
    Transaction t(nextTransactionId++, numero, -1, "Depot", montant, currentDate(), c->solde);
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    msg = "Depot reussi";
    return true;
}

bool Banque::retrait(int numero, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) { msg = "Montant invalide"; return false; }
    
    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    if (c->solde < montant) { msg = "Solde insuffisant"; return false; }
    
    c->solde -= montant;
    mettreAJourCompte(*c);
    
    Transaction t(nextTransactionId++, numero, -1, "Retrait", montant, currentDate(), c->solde);
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    msg = "Retrait reussi";
    return true;
}

bool Banque::virement(int src, int dest, double montant, std::string& msg) {
    if (montant <= 0 || !std::isfinite(montant)) { msg = "Montant invalide"; return false; }
    if (src == dest) { msg = "Comptes identiques"; return false; }
    
    Compte* cs = trouverCompte(src);
    Compte* cd = trouverCompte(dest);
    if (!cs || !cs->actif) { msg = "Compte source invalide"; return false; }
    if (!cd || !cd->actif) { msg = "Compte destinataire invalide"; return false; }
    if (cs->solde < montant) { msg = "Solde insuffisant"; return false; }
    
    cs->solde -= montant;
    cd->solde += montant;
    mettreAJourCompte(*cs);
    mettreAJourCompte(*cd);
    
    std::string date = currentDate();
    Transaction t1(nextTransactionId++, src, dest, "Virement emis", montant, date, cs->solde);
    Transaction t2(nextTransactionId++, dest, src, "Virement recu", montant, date, cd->solde);
    
    transactions.push_back(t1);
    transactions.push_back(t2);
    sauvegarderTransaction(t1);
    sauvegarderTransaction(t2);
    
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