#include "Banque.h"
#include "Crypto.h"
#include <sstream>
#include <ctime>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <cstdlib>
#include <random>

std::string Banque::currentDate() {
    std::time_t t = std::time(nullptr);
    std::tm* tm = std::localtime(&t);
    std::ostringstream oss;
    oss << std::put_time(tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

std::string Banque::addMinutesToDate(int minutes) {
    std::time_t t = std::time(nullptr) + (minutes * 60);
    std::tm* tm = std::localtime(&t);
    std::ostringstream oss;
    oss << std::put_time(tm, "%Y-%m-%d %H:%M:%S");
    return oss.str();
}

bool Banque::isDatePassed(const std::string& dateIso) {
    if (dateIso.empty()) return true;
    std::tm tm = {};
    std::istringstream ss(dateIso);
    ss >> std::get_time(&tm, "%Y-%m-%d %H:%M:%S");
    if (ss.fail()) return true;
    std::time_t target = std::mktime(&tm);
    std::time_t now = std::time(nullptr);
    return now >= target;
}

Banque::Banque() : nextTransactionId(1), nextBeneficiaireId(1), nextAuditLogId(1) {
    const char* dbUrl = std::getenv("DATABASE_URL");
    std::string url = dbUrl ? dbUrl : "postgresql://localhost:5432/minibank";
    
    try {
        conn = std::make_unique<pqxx::connection>(url);
        std::cout << "[DB] Connecté à PostgreSQL" << std::endl;
        initDB();
        chargerDepuisDB();
        assurerAdminParDefaut();
    } catch (const std::exception& e) {
        std::cerr << "[DB] Note: PostgreSQL non disponible (" << e.what() << "). Mode en mémoire actif." << std::endl;
        conn = nullptr;
        assurerAdminParDefaut();
    }
}

Banque::~Banque() {}

void Banque::initDB() {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec(R"(
            CREATE TABLE IF NOT EXISTS comptes (
                numero INTEGER PRIMARY KEY,
                titulaire VARCHAR(100) NOT NULL,
                pin_hash VARCHAR(64) NOT NULL,
                pin_salt VARCHAR(32) NOT NULL,
                solde BIGINT DEFAULT 0,
                devise VARCHAR(10) DEFAULT 'FCFA',
                typeCompte VARCHAR(20) DEFAULT 'Courant',
                actif BOOLEAN DEFAULT TRUE,
                isAdmin BOOLEAN DEFAULT FALSE,
                role VARCHAR(20) DEFAULT 'CLIENT',
                mfa_enabled BOOLEAN DEFAULT FALSE,
                mfa_secret VARCHAR(64) DEFAULT '',
                failed_attempts INTEGER DEFAULT 0,
                locked_until VARCHAR(30) DEFAULT '',
                limite_virement_jour BIGINT DEFAULT 1000000,
                dateCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(64) DEFAULT '';
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS pin_salt VARCHAR(32) DEFAULT '';
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'CLIENT';
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS locked_until VARCHAR(30) DEFAULT '';
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS limite_virement_jour BIGINT DEFAULT 1000000;
            ALTER TABLE comptes ADD COLUMN IF NOT EXISTS devise VARCHAR(10) DEFAULT 'FCFA';

            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                reference VARCHAR(50) UNIQUE,
                idempotency_key VARCHAR(64),
                compteSource INTEGER,
                compteDest INTEGER,
                type VARCHAR(100) NOT NULL,
                operateur VARCHAR(50) DEFAULT 'Banque',
                detailsCible VARCHAR(100) DEFAULT '',
                montant BIGINT NOT NULL,
                soldeApres BIGINT,
                statut VARCHAR(20) DEFAULT 'EXECUTE',
                motif VARCHAR(255) DEFAULT '',
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference VARCHAR(50);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64);
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operateur VARCHAR(50) DEFAULT 'Banque';
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS detailsCible VARCHAR(100) DEFAULT '';
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'EXECUTE';
            ALTER TABLE transactions ADD COLUMN IF NOT EXISTS motif VARCHAR(255) DEFAULT '';

            CREATE TABLE IF NOT EXISTS beneficiaires (
                id SERIAL PRIMARY KEY,
                compte_proprietaire INTEGER NOT NULL,
                numero_compte_cible INTEGER NOT NULL,
                nom_alias VARCHAR(100) NOT NULL,
                email VARCHAR(100) DEFAULT '',
                date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                compte_numero INTEGER,
                event_type VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                ip_address VARCHAR(45) DEFAULT '',
                status VARCHAR(20) DEFAULT 'SUCCESS'
            );
        )");
        txn.commit();
        std::cout << "[DB] Schéma relationnel bancaire initialisé avec succès" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] initDB: " << e.what() << std::endl;
    }
}

void Banque::chargerDepuisDB() {
    if (!conn) return;
    comptes.clear();
    transactions.clear();
    beneficiaires.clear();
    auditLogs.clear();
    
    try {
        pqxx::work txn(*conn);
        
        // Charger les comptes
        pqxx::result resComptes = txn.exec(
            "SELECT numero, titulaire, pin_hash, pin_salt, solde, devise, typeCompte, actif, isAdmin, "
            "role, mfa_enabled, mfa_secret, failed_attempts, locked_until, limite_virement_jour, dateCreation "
            "FROM comptes ORDER BY numero"
        );
        for (const auto& row : resComptes) {
            std::string salt = row["pin_salt"].is_null() ? "" : row["pin_salt"].as<std::string>();
            std::string hash = row["pin_hash"].is_null() ? "" : row["pin_hash"].as<std::string>();
            
            Compte c(
                row["numero"].as<int>(),
                row["titulaire"].as<std::string>(),
                hash,
                salt,
                row["solde"].as<int64_t>(),
                row["typecompte"].as<std::string>(),
                row["actif"].as<bool>(),
                row["isadmin"].as<bool>(),
                row["mfa_enabled"].as<bool>(),
                row["mfa_secret"].as<std::string>(),
                row["role"].is_null() ? "CLIENT" : row["role"].as<std::string>(),
                row["failed_attempts"].is_null() ? 0 : row["failed_attempts"].as<int>(),
                row["locked_until"].is_null() ? "" : row["locked_until"].as<std::string>(),
                row["limite_virement_jour"].is_null() ? 1000000 : row["limite_virement_jour"].as<int64_t>(),
                row["devise"].is_null() ? "FCFA" : row["devise"].as<std::string>(),
                row["datecreation"].is_null() ? "" : row["datecreation"].as<std::string>()
            );
            comptes.push_back(c);
        }
        
        // Charger les transactions
        pqxx::result resTrans = txn.exec(
            "SELECT id, reference, idempotency_key, compteSource, compteDest, type, operateur, "
            "detailsCible, montant, soldeApres, statut, motif, date FROM transactions ORDER BY id"
        );
        for (const auto& row : resTrans) {
            Transaction t(
                row["id"].as<int>(),
                row["reference"].is_null() ? "" : row["reference"].as<std::string>(),
                row["idempotency_key"].is_null() ? "" : row["idempotency_key"].as<std::string>(),
                row["comptesource"].is_null() ? -1 : row["comptesource"].as<int>(),
                row["comptedest"].is_null() ? -1 : row["comptedest"].as<int>(),
                row["type"].as<std::string>(),
                row["operateur"].is_null() ? "Banque" : row["operateur"].as<std::string>(),
                row["detailscible"].is_null() ? "" : row["detailscible"].as<std::string>(),
                row["montant"].as<int64_t>(),
                row["date"].as<std::string>(),
                row["soldeapres"].is_null() ? 0 : row["soldeapres"].as<int64_t>(),
                row["statut"].is_null() ? "EXECUTE" : row["statut"].as<std::string>(),
                row["motif"].is_null() ? "" : row["motif"].as<std::string>()
            );
            transactions.push_back(t);
            if (t.id >= nextTransactionId) nextTransactionId = t.id + 1;
        }

        // Charger les bénéficiaires
        pqxx::result resBenef = txn.exec("SELECT id, compte_proprietaire, numero_compte_cible, nom_alias, email, date_ajout FROM beneficiaires ORDER BY id");
        for (const auto& row : resBenef) {
            Beneficiaire b(
                row["id"].as<int>(),
                row["compte_proprietaire"].as<int>(),
                row["numero_compte_cible"].as<int>(),
                row["nom_alias"].as<std::string>(),
                row["email"].is_null() ? "" : row["email"].as<std::string>(),
                row["date_ajout"].as<std::string>()
            );
            beneficiaires.push_back(b);
            if (b.id >= nextBeneficiaireId) nextBeneficiaireId = b.id + 1;
        }

        // Charger les logs d'audit récents
        pqxx::result resLogs = txn.exec("SELECT id, timestamp, compte_numero, event_type, description, ip_address, status FROM audit_logs ORDER BY id DESC LIMIT 500");
        for (const auto& row : resLogs) {
            AuditLog al(
                row["id"].as<int>(),
                row["timestamp"].as<std::string>(),
                row["compte_numero"].is_null() ? -1 : row["compte_numero"].as<int>(),
                row["event_type"].as<std::string>(),
                row["description"].as<std::string>(),
                row["ip_address"].is_null() ? "" : row["ip_address"].as<std::string>(),
                row["status"].as<std::string>()
            );
            auditLogs.push_back(al);
            if (al.id >= nextAuditLogId) nextAuditLogId = al.id + 1;
        }
        
        std::cout << "[DB] Chargement : " << comptes.size() << " comptes, " 
                  << transactions.size() << " transactions, "
                  << beneficiaires.size() << " bénéficiaires, "
                  << auditLogs.size() << " logs d'audit." << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] chargerDepuisDB: " << e.what() << std::endl;
    }
}

void Banque::assurerAdminParDefaut() {
    for (const auto& c : comptes) {
        if (c.isAdmin) return;
    }
    
    // Hash sécurisé PBKDF2 pour l'admin avec sel aléatoire
    std::string adminSalt = Crypto::generateSalt(16);
    std::string adminHash = Crypto::hashPin("0000", adminSalt);

    Compte admin(9999, "ADMINISTRATEUR", adminHash, adminSalt, 0, "Admin", true, true, false, "", "ADMIN", 0, "", 100000000, "FCFA", currentDate());
    comptes.push_back(admin);
    sauvegarderCompte(admin);
    logAudit(9999, "INIT_ADMIN", "Compte administrateur initialisé avec PIN sécurisé haché");
    std::cout << "[INFO] Compte admin par défaut créé : numéro 9999, PIN sécurisé" << std::endl;
}

void Banque::sauvegarderCompte(const Compte& c) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params(
            "INSERT INTO comptes (numero, titulaire, pin_hash, pin_salt, solde, devise, typeCompte, actif, isAdmin, role, mfa_enabled, mfa_secret, failed_attempts, locked_until, limite_virement_jour) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) "
            "ON CONFLICT (numero) DO UPDATE SET "
            "titulaire = $2, pin_hash = $3, pin_salt = $4, solde = $5, devise = $6, typeCompte = $7, actif = $8, isAdmin = $9, role = $10, mfa_enabled = $11, mfa_secret = $12, failed_attempts = $13, locked_until = $14, limite_virement_jour = $15",
            c.numero, c.titulaire, c.pinHash, c.pinSalt, c.solde, c.devise, c.typeCompte, c.actif, c.isAdmin, c.role, c.mfaEnabled, c.mfaSecret, c.failedAttempts, c.lockedUntil, c.limiteVirementJour
        );
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] sauvegarderCompte: " << e.what() << std::endl;
    }
}

void Banque::mettreAJourCompte(const Compte& c) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params(
            "UPDATE comptes SET titulaire = $1, pin_hash = $2, pin_salt = $3, solde = $4, devise = $5, typeCompte = $6, actif = $7, isAdmin = $8, role = $9, mfa_enabled = $10, mfa_secret = $11, failed_attempts = $12, locked_until = $13, limite_virement_jour = $14 WHERE numero = $15",
            c.titulaire, c.pinHash, c.pinSalt, c.solde, c.devise, c.typeCompte, c.actif, c.isAdmin, c.role, c.mfaEnabled, c.mfaSecret, c.failedAttempts, c.lockedUntil, c.limiteVirementJour, c.numero
        );
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] mettreAJourCompte: " << e.what() << std::endl;
    }
}

void Banque::supprimerCompteDB(int numero) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params("DELETE FROM comptes WHERE numero = $1", numero);
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] supprimerCompteDB: " << e.what() << std::endl;
    }
}

void Banque::sauvegarderTransaction(const Transaction& t) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params(
            "INSERT INTO transactions (id, reference, idempotency_key, compteSource, compteDest, type, operateur, detailsCible, montant, soldeApres, statut, motif, date) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
            t.id, t.reference, t.idempotencyKey, t.compteSource, t.compteDest, t.type,
            t.operateur, t.detailsCible, t.montant, t.soldeApres, t.statut, t.motif, t.date
        );
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] sauvegarderTransaction: " << e.what() << std::endl;
    }
}

void Banque::sauvegarderBeneficiaire(const Beneficiaire& b) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params(
            "INSERT INTO beneficiaires (id, compte_proprietaire, numero_compte_cible, nom_alias, email, date_ajout) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            b.id, b.compteProprietaire, b.numeroCompteCible, b.nomAlias, b.email, b.dateAjout
        );
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] sauvegarderBeneficiaire: " << e.what() << std::endl;
    }
}

void Banque::supprimerBeneficiaireDB(int id) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params("DELETE FROM beneficiaires WHERE id = $1", id);
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] supprimerBeneficiaireDB: " << e.what() << std::endl;
    }
}

void Banque::sauvegarderAuditLog(const AuditLog& log) {
    if (!conn) return;
    try {
        pqxx::work txn(*conn);
        txn.exec_params(
            "INSERT INTO audit_logs (id, timestamp, compte_numero, event_type, description, ip_address, status) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            log.id, log.timestamp, log.compteNumero, log.eventType, log.description, log.ipAddress, log.status
        );
        txn.commit();
    } catch (const std::exception& e) {
        std::cerr << "[DB Error] sauvegarderAuditLog: " << e.what() << std::endl;
    }
}

void Banque::logAudit(int compteNumero, const std::string& eventType, const std::string& desc,
                      const std::string& ip, const std::string& status) {
    AuditLog log(nextAuditLogId++, currentDate(), compteNumero, eventType, desc, ip, status);
    auditLogs.push_back(log);
    sauvegarderAuditLog(log);
}

std::vector<AuditLog> Banque::getAuditLogs(int compteNumero, int limit) {
    std::vector<AuditLog> res;
    for (auto it = auditLogs.rbegin(); it != auditLogs.rend(); ++it) {
        if (compteNumero <= 0 || it->compteNumero == compteNumero) {
            res.push_back(*it);
            if (static_cast<int>(res.size()) >= limit) break;
        }
    }
    return res;
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

Transaction* Banque::trouverTransaction(int id) {
    for (auto& t : transactions)
        if (t.id == id) return &t;
    return nullptr;
}

Transaction* Banque::trouverTransactionParRef(const std::string& ref) {
    for (auto& t : transactions)
        if (t.reference == ref) return &t;
    return nullptr;
}

Transaction* Banque::trouverTransactionParIdempotencyKey(const std::string& key) {
    if (key.empty()) return nullptr;
    for (auto& t : transactions)
        if (t.idempotencyKey == key) return &t;
    return nullptr;
}

static bool numeroExiste(const std::vector<Compte>& comptes, int numero) {
    for (const auto& c : comptes)
        if (c.numero == numero) return true;
    return false;
}

int Banque::creerCompte(const std::string& titulaire, const std::string& pin,
                        const std::string& type, int64_t soldeInitial,
                        int numeroForce, bool isAdmin, const std::string& role) {
    if (pin.length() != 4) return -1;
    if (titulaire.empty()) return -1;
    if (soldeInitial < 0) soldeInitial = 0;
    
    int num;
    if (numeroForce > 0) {
        if (numeroExiste(comptes, numeroForce)) return -2;
        num = numeroForce;
    } else {
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<int> dis(100000000, 999999999);
        do {
            num = dis(gen);
        } while (numeroExiste(comptes, num));
    }
    
    // Hachage cryptographique du PIN avec sel aléatoire unique (PBKDF2)
    std::string salt = Crypto::generateSalt(16);
    std::string hash = Crypto::hashPin(pin, salt);
    std::string now = currentDate();

    Compte c(num, titulaire, hash, salt, soldeInitial, type, true, isAdmin, false, "", role, 0, "", 1000000, "FCFA", now);
    comptes.push_back(c);
    sauvegarderCompte(c);
    logAudit(num, "ACCOUNT_CREATED", "Création de compte réussie avec solde initial: " + std::to_string(soldeInitial) + " FCFA");
    
    if (soldeInitial > 0) {
        std::string ref = Crypto::generateTxnReference();
        Transaction t(nextTransactionId++, ref, "", num, -1, "Depot initial", "Banque",
                      "Ouverture de compte", soldeInitial, now, soldeInitial, "EXECUTE", "Versement initial");
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
    logAudit(numero, "ACCOUNT_MODIFIED", "Mise à jour du profil");
    return true;
}

bool Banque::changerPin(int numero, const std::string& ancienPin, const std::string& nouveauPin, std::string& msg) {
    if (nouveauPin.length() != 4) { msg = "Le nouveau code PIN doit comporter 4 chiffres"; return false; }
    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    
    if (!Crypto::verifyPin(ancienPin, c->pinSalt, c->pinHash)) {
        msg = "Ancien code PIN incorrect";
        logAudit(numero, "PIN_CHANGE_FAILED", "Échec changement PIN", "", "FAILURE");
        return false;
    }
    
    std::string newSalt = Crypto::generateSalt(16);
    std::string newHash = Crypto::hashPin(nouveauPin, newSalt);
    c->pinSalt = newSalt;
    c->pinHash = newHash;
    mettreAJourCompte(*c);
    
    logAudit(numero, "PIN_CHANGED", "Changement de code PIN effectué");
    msg = "Code PIN modifié avec succès";
    return true;
}

bool Banque::fermerCompte(int numero) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    if (c->solde != 0) return false;
    
    c->actif = false;
    mettreAJourCompte(*c);
    logAudit(numero, "ACCOUNT_CLOSED", "Clôture du compte bancaire");
    return true;
}

bool Banque::supprimerCompte(int numero) {
    auto it = std::find_if(comptes.begin(), comptes.end(),
        [numero](const Compte& c) { return c.numero == numero; });
    if (it == comptes.end()) return false;
    
    comptes.erase(it);
    supprimerCompteDB(numero);
    logAudit(numero, "ACCOUNT_DELETED", "Suppression définitive par administrateur");
    return true;
}

bool Banque::setCompteStatut(int numero, bool actif, std::string& msg) {
    Compte* c = trouverCompte(numero);
    if (!c) {
        msg = "Compte introuvable";
        return false;
    }
    if (c->isAdmin) {
        msg = "Impossible de modifier le statut d'un compte administrateur";
        return false;
    }
    c->actif = actif;
    mettreAJourCompte(*c);
    logAudit(numero, actif ? "ACCOUNT_ACTIVATED" : "ACCOUNT_SUSPENDED",
             actif ? "Compte réactivé par administrateur" : "Compte suspendu par administrateur");
    msg = actif ? "Compte réactivé avec succès" : "Compte suspendu avec succès";
    return true;
}

bool Banque::changerNumero(int ancienNumero, int nouveauNumero, std::string& msg) {
    if (nouveauNumero <= 0) { msg = "Numéro invalide"; return false; }
    if (ancienNumero == nouveauNumero) { msg = "Identique"; return false; }
    
    Compte* c = trouverCompte(ancienNumero);
    if (!c) { msg = "Compte introuvable"; return false; }
    if (numeroExiste(comptes, nouveauNumero)) { msg = "Numéro déjà utilisé"; return false; }
    
    if (conn) {
        try {
            pqxx::work txn(*conn);
            txn.exec_params("UPDATE transactions SET compteSource = $1 WHERE compteSource = $2", nouveauNumero, ancienNumero);
            txn.exec_params("UPDATE transactions SET compteDest = $1 WHERE compteDest = $2", nouveauNumero, ancienNumero);
            txn.exec_params("UPDATE beneficiaires SET compte_proprietaire = $1 WHERE compte_proprietaire = $2", nouveauNumero, ancienNumero);
            txn.exec_params("UPDATE beneficiaires SET numero_compte_cible = $1 WHERE numero_compte_cible = $2", nouveauNumero, ancienNumero);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] changerNumero: " << e.what() << std::endl;
        }
    }
    
    for (auto& t : transactions) {
        if (t.compteSource == ancienNumero) t.compteSource = nouveauNumero;
        if (t.compteDest == ancienNumero) t.compteDest = nouveauNumero;
    }
    for (auto& b : beneficiaires) {
        if (b.compteProprietaire == ancienNumero) b.compteProprietaire = nouveauNumero;
        if (b.numeroCompteCible == ancienNumero) b.numeroCompteCible = nouveauNumero;
    }
    
    c->numero = nouveauNumero;
    sauvegarderCompte(*c);
    
    logAudit(nouveauNumero, "ACCOUNT_NUMBER_CHANGED", "Numéro changé de " + std::to_string(ancienNumero) + " à " + std::to_string(nouveauNumero));
    msg = "Numéro modifié";
    return true;
}

AuthResult Banque::authentifier(int numero, const std::string& pin, std::string& msg) {
    Compte* c = trouverCompte(numero);
    if (!c) {
        msg = "Numéro de compte ou code PIN invalide";
        return AuthResult::NOT_FOUND;
    }
    if (!c->actif) {
        msg = "Ce compte bancaire a été clôturé ou désactivé";
        return AuthResult::ACCOUNT_INACTIVE;
    }
    
    // Vérification du verrouillage temporaire anti-brute force
    if (!c->lockedUntil.empty()) {
        if (!isDatePassed(c->lockedUntil)) {
            msg = "Compte temporairement verrouillé pour des raisons de sécurité jusqu'à : " + c->lockedUntil;
            logAudit(numero, "AUTH_BLOCKED", "Tentative d'accès sur compte verrouillé", "", "BLOCKED");
            return AuthResult::ACCOUNT_LOCKED;
        } else {
            // Déverrouillage automatique après écoulement du délai
            c->lockedUntil = "";
            c->failedAttempts = 0;
            mettreAJourCompte(*c);
        }
    }
    
    // Vérification du hash PBKDF2 en temps constant
    if (Crypto::verifyPin(pin, c->pinSalt, c->pinHash)) {
        c->failedAttempts = 0;
        c->lockedUntil = "";
        mettreAJourCompte(*c);
        logAudit(numero, "LOGIN_SUCCESS", "Connexion réussie");
        msg = "Connexion réussie";
        return AuthResult::SUCCESS;
    } else {
        c->failedAttempts++;
        if (c->failedAttempts >= 5) {
            c->lockedUntil = addMinutesToDate(15);
            mettreAJourCompte(*c);
            logAudit(numero, "ACCOUNT_LOCKED", "Verrouillage de compte suite à 5 tentatives infructueuses", "", "BLOCKED");
            msg = "Compte verrouillé pour 15 minutes suite à 5 tentatives infructueuses.";
            return AuthResult::ACCOUNT_LOCKED;
        } else {
            mettreAJourCompte(*c);
            int restants = 5 - c->failedAttempts;
            logAudit(numero, "LOGIN_FAILED", "Code PIN incorrect (échec " + std::to_string(c->failedAttempts) + "/5)", "", "FAILURE");
            msg = "Identifiants invalides. Essais restants avant verrouillage : " + std::to_string(restants);
            return AuthResult::INVALID_CREDENTIALS;
        }
    }
}

bool Banque::depot(int numero, int64_t montant, std::string& msg, const std::string& idempotencyKey) {
    if (montant <= 0) { msg = "Montant invalide"; return false; }
    
    // Idempotence : si l'opération a déjà été traitée avec cette clé, ne pas re-créditer
    if (!idempotencyKey.empty()) {
        Transaction* prev = trouverTransactionParIdempotencyKey(idempotencyKey);
        if (prev) {
            msg = "Opération déjà enregistrée (idempotence)";
            return true;
        }
    }

    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    
    if (conn) {
        try {
            pqxx::work txn(*conn);
            txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", numero);
            txn.exec_params("UPDATE comptes SET solde = solde + $1 WHERE numero = $2", montant, numero);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] depot ACID: " << e.what() << std::endl;
            msg = "Erreur base de données lors de la transaction";
            return false;
        }
    }
    
    c->solde += montant;
    std::string ref = Crypto::generateTxnReference();
    std::string date = currentDate();
    Transaction t(nextTransactionId++, ref, idempotencyKey, numero, -1, "Depot", "Guichet Banque",
                  "Dépôt d'espèces", montant, date, c->solde, "EXECUTE", "Dépôt d'espèces");
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    logAudit(numero, "DEPOT", "Dépôt de " + std::to_string(montant) + " FCFA (Réf: " + ref + ")");
    msg = "Dépôt effectué avec succès";
    return true;
}

bool Banque::retrait(int numero, int64_t montant, std::string& msg, const std::string& idempotencyKey) {
    if (montant <= 0) { msg = "Montant invalide"; return false; }
    
    if (!idempotencyKey.empty()) {
        Transaction* prev = trouverTransactionParIdempotencyKey(idempotencyKey);
        if (prev) {
            msg = "Opération déjà enregistrée (idempotence)";
            return true;
        }
    }

    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    if (c->solde < montant) { msg = "Solde insuffisant pour ce retrait"; return false; }
    
    if (conn) {
        try {
            pqxx::work txn(*conn);
            pqxx::result r = txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", numero);
            if (r.empty() || r[0]["solde"].as<int64_t>() < montant) {
                msg = "Solde insuffisant lors du verrouillage bancaire";
                return false;
            }
            txn.exec_params("UPDATE comptes SET solde = solde - $1 WHERE numero = $2", montant, numero);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] retrait ACID: " << e.what() << std::endl;
            msg = "Erreur base de données lors du retrait";
            return false;
        }
    }
    
    c->solde -= montant;
    std::string ref = Crypto::generateTxnReference();
    std::string date = currentDate();
    Transaction t(nextTransactionId++, ref, idempotencyKey, numero, -1, "Retrait", "DAB / Guichet",
                  "Retrait d'espèces", montant, date, c->solde, "EXECUTE", "Retrait d'espèces");
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    logAudit(numero, "RETRAIT", "Retrait de " + std::to_string(montant) + " FCFA (Réf: " + ref + ")");
    msg = "Retrait effectué avec succès";
    return true;
}

int64_t Banque::getSommeVirementsAujourdhui(int numero) {
    std::string today = currentDate().substr(0, 10);
    int64_t total = 0;
    for (const auto& t : transactions) {
        if (t.compteSource == numero && t.type.find("Virement") != std::string::npos && t.statut == "EXECUTE") {
            if (t.date.substr(0, 10) == today) {
                total += t.montant;
            }
        }
    }
    return total;
}

bool Banque::virement(int src, int dest, int64_t montant, std::string& msg,
                      const std::string& motif, const std::string& idempotencyKey) {
    if (montant <= 0) { msg = "Montant invalide"; return false; }
    if (src == dest) { msg = "Impossible d'effectuer un virement vers le même compte"; return false; }
    
    if (!idempotencyKey.empty()) {
        Transaction* prev = trouverTransactionParIdempotencyKey(idempotencyKey);
        if (prev) {
            msg = "Ce virement a déjà été exécuté (idempotence respectée)";
            return true;
        }
    }

    Compte* cs = trouverCompte(src);
    Compte* cd = trouverCompte(dest);
    if (!cs || !cs->actif) { msg = "Compte source introuvable ou inactif"; return false; }
    if (!cd || !cd->actif) { msg = "Compte destinataire introuvable ou inactif"; return false; }
    
    // Vérification de limite journalière
    int64_t dejaVire = getSommeVirementsAujourdhui(src);
    if (dejaVire + montant > cs->limiteVirementJour) {
        msg = "Plafond journalier de virement dépassé. Limite : " + std::to_string(cs->limiteVirementJour) + " FCFA (Déjà viré aujourd'hui : " + std::to_string(dejaVire) + " FCFA)";
        logAudit(src, "VIREMENT_LIMIT_EXCEEDED", "Plafond dépassé pour virement vers " + std::to_string(dest), "", "FAILURE");
        return false;
    }

    if (cs->solde < montant) {
        msg = "Solde insuffisant pour effectuer ce virement";
        return false;
    }
    
    // Transaction ACID complète avec verrouillage ordonné pessimiste pour éliminer tout risque de deadlock
    if (conn) {
        try {
            pqxx::work txn(*conn);
            int firstLock = std::min(src, dest);
            int secondLock = std::max(src, dest);
            txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", firstLock);
            txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", secondLock);
            
            pqxx::result rSrc = txn.exec_params("SELECT solde FROM comptes WHERE numero = $1", src);
            if (rSrc.empty() || rSrc[0]["solde"].as<int64_t>() < montant) {
                msg = "Solde insuffisant constaté lors du verrouillage transactionnel";
                return false;
            }
            
            txn.exec_params("UPDATE comptes SET solde = solde - $1 WHERE numero = $2", montant, src);
            txn.exec_params("UPDATE comptes SET solde = solde + $1 WHERE numero = $2", montant, dest);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] virement ACID: " << e.what() << std::endl;
            msg = "Erreur critique de transaction bancaire";
            return false;
        }
    }
    
    cs->solde -= montant;
    cd->solde += montant;
    
    std::string ref = Crypto::generateTxnReference();
    std::string date = currentDate();
    std::string libelle = motif.empty() ? ("Virement vers " + cd->titulaire) : motif;

    Transaction t1(nextTransactionId++, ref, idempotencyKey, src, dest, "Virement emis", "Virement Interne",
                   cd->titulaire, montant, date, cs->solde, "EXECUTE", libelle);
    Transaction t2(nextTransactionId++, ref, idempotencyKey, dest, src, "Virement recu", "Virement Interne",
                   cs->titulaire, montant, date, cd->solde, "EXECUTE", libelle);
    
    transactions.push_back(t1);
    transactions.push_back(t2);
    sauvegarderTransaction(t1);
    sauvegarderTransaction(t2);
    
    logAudit(src, "VIREMENT_EMIS", "Virement de " + std::to_string(montant) + " FCFA vers compte " + std::to_string(dest) + " (Réf: " + ref + ")");
    logAudit(dest, "VIREMENT_RECU", "Réception de " + std::to_string(montant) + " FCFA depuis compte " + std::to_string(src) + " (Réf: " + ref + ")");
    
    msg = "Virement de " + std::to_string(montant) + " FCFA effectué avec succès. Réf : " + ref;
    return true;
}

bool Banque::rechargeMobileMoney(int numero, const std::string& operateur, const std::string& telephone,
                                 int64_t montant, std::string& msg, const std::string& idempotencyKey) {
    if (montant <= 0) { msg = "Montant de recharge invalide"; return false; }
    if (telephone.empty()) { msg = "Numéro de téléphone Mobile Money requis"; return false; }
    
    if (!idempotencyKey.empty()) {
        Transaction* prev = trouverTransactionParIdempotencyKey(idempotencyKey);
        if (prev) {
            msg = "Recharge déjà exécutée (idempotence)";
            return true;
        }
    }

    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    
    if (conn) {
        try {
            pqxx::work txn(*conn);
            txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", numero);
            txn.exec_params("UPDATE comptes SET solde = solde + $1 WHERE numero = $2", montant, numero);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] rechargeMobileMoney ACID: " << e.what() << std::endl;
            msg = "Erreur transactionnelle base de données";
            return false;
        }
    }
    
    c->solde += montant;
    std::string ref = Crypto::generateTxnReference();
    std::string opLabel = operateur.empty() ? "Mobile Money" : operateur;
    std::string details = opLabel + " (" + telephone + ")";
    std::string date = currentDate();

    Transaction t(nextTransactionId++, ref, idempotencyKey, numero, -1, "Recharge Mobile Money",
                  opLabel, telephone, montant, date, c->solde, "EXECUTE", "Recharge via " + opLabel);
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    logAudit(numero, "MOBILE_MONEY_RECHARGE", "Recharge de " + std::to_string(montant) + " FCFA via " + details);
    msg = "Recharge Mobile Money de " + std::to_string(montant) + " FCFA effectuée avec succès (Réf: " + ref + ")";
    return true;
}

bool Banque::retraitMobileMoney(int numero, const std::string& operateur, const std::string& telephone,
                                int64_t montant, std::string& msg, const std::string& idempotencyKey) {
    if (montant <= 0) { msg = "Montant de retrait invalide"; return false; }
    if (telephone.empty()) { msg = "Numéro de téléphone Mobile Money requis"; return false; }
    
    if (!idempotencyKey.empty()) {
        Transaction* prev = trouverTransactionParIdempotencyKey(idempotencyKey);
        if (prev) {
            msg = "Retrait déjà exécuté (idempotence)";
            return true;
        }
    }

    Compte* c = trouverCompte(numero);
    if (!c || !c->actif) { msg = "Compte introuvable ou inactif"; return false; }
    if (c->solde < montant) { msg = "Solde bancaire insuffisant"; return false; }
    
    if (conn) {
        try {
            pqxx::work txn(*conn);
            pqxx::result r = txn.exec_params("SELECT solde FROM comptes WHERE numero = $1 FOR UPDATE", numero);
            if (r.empty() || r[0]["solde"].as<int64_t>() < montant) {
                msg = "Solde insuffisant lors du verrouillage";
                return false;
            }
            txn.exec_params("UPDATE comptes SET solde = solde - $1 WHERE numero = $2", montant, numero);
            txn.commit();
        } catch (const std::exception& e) {
            std::cerr << "[DB Error] retraitMobileMoney ACID: " << e.what() << std::endl;
            msg = "Erreur base de données lors du retrait";
            return false;
        }
    }
    
    c->solde -= montant;
    std::string ref = Crypto::generateTxnReference();
    std::string opLabel = operateur.empty() ? "Mobile Money" : operateur;
    std::string details = opLabel + " (" + telephone + ")";
    std::string date = currentDate();

    Transaction t(nextTransactionId++, ref, idempotencyKey, numero, -1, "Retrait Mobile Money",
                  opLabel, telephone, montant, date, c->solde, "EXECUTE", "Transfert vers " + opLabel);
    transactions.push_back(t);
    sauvegarderTransaction(t);
    
    logAudit(numero, "MOBILE_MONEY_RETRAIT", "Retrait de " + std::to_string(montant) + " FCFA vers " + details);
    msg = "Retrait Mobile Money de " + std::to_string(montant) + " FCFA effectué avec succès (Réf: " + ref + ")";
    return true;
}

bool Banque::ajouterBeneficiaire(int proprietaire, int compteCible, const std::string& alias, const std::string& email, std::string& msg) {
    if (proprietaire == compteCible) { msg = "Vous ne pouvez pas vous ajouter vous-même en bénéficiaire"; return false; }
    Compte* target = trouverCompte(compteCible);
    if (!target || !target->actif) { msg = "Le compte cible spécifié n'existe pas ou est inactif"; return false; }
    
    for (const auto& b : beneficiaires) {
        if (b.compteProprietaire == proprietaire && b.numeroCompteCible == compteCible) {
            msg = "Ce compte figure déjà parmi vos bénéficiaires";
            return false;
        }
    }
    
    std::string nom = alias.empty() ? target->titulaire : alias;
    Beneficiaire b(nextBeneficiaireId++, proprietaire, compteCible, nom, email, currentDate());
    beneficiaires.push_back(b);
    sauvegarderBeneficiaire(b);
    
    logAudit(proprietaire, "BENEFICIAIRE_ADDED", "Ajout du bénéficiaire " + nom + " (" + std::to_string(compteCible) + ")");
    msg = "Bénéficiaire ajouté avec succès";
    return true;
}

bool Banque::supprimerBeneficiaire(int proprietaire, int beneficiaireIdOuNumero) {
    auto it = std::find_if(beneficiaires.begin(), beneficiaires.end(),
        [proprietaire, beneficiaireIdOuNumero](const Beneficiaire& b) {
            return b.compteProprietaire == proprietaire &&
                   (b.id == beneficiaireIdOuNumero || b.numeroCompteCible == beneficiaireIdOuNumero);
        });
    if (it == beneficiaires.end()) return false;
    
    int id = it->id;
    beneficiaires.erase(it);
    supprimerBeneficiaireDB(id);
    logAudit(proprietaire, "BENEFICIAIRE_REMOVED", "Suppression du bénéficiaire ID " + std::to_string(id));
    return true;
}

std::string Banque::getDerniereReference(int numero) {
    for (auto it = transactions.rbegin(); it != transactions.rend(); ++it) {
        if (it->compteSource == numero || it->compteDest == numero) {
            return it->reference;
        }
    }
    return "";
}

std::vector<Beneficiaire> Banque::getBeneficiaires(int proprietaire) {
    std::vector<Beneficiaire> res;
    for (const auto& b : beneficiaires) {
        if (b.compteProprietaire == proprietaire) res.push_back(b);
    }
    return res;
}

bool Banque::activerMFA(int numero, const std::string& secret) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    c->mfaEnabled = true;
    c->mfaSecret = secret;
    mettreAJourCompte(*c);
    logAudit(numero, "MFA_ENABLED", "Activation de l'authentification 2FA");
    return true;
}

bool Banque::desactiverMFA(int numero) {
    Compte* c = trouverCompte(numero);
    if (!c) return false;
    c->mfaEnabled = false;
    c->mfaSecret = "";
    mettreAJourCompte(*c);
    logAudit(numero, "MFA_DISABLED", "Désactivation de l'authentification 2FA");
    return true;
}

bool Banque::estMFAActif(int numero) {
    Compte* c = trouverCompte(numero);
    return c && c->mfaEnabled;
}

std::string Banque::getMFASecret(int numero) {
    Compte* c = trouverCompte(numero);
    return c ? c->mfaSecret : "";
}

std::vector<Transaction> Banque::getHistorique(int numero) {
    std::vector<Transaction> result;
    for (const auto& t : transactions) {
        if (t.compteSource == numero) result.push_back(t);
    }
    std::reverse(result.begin(), result.end());
    return result;
}

std::vector<Transaction> Banque::filtrerHistorique(int numero, const std::string& type,
                                                  int64_t montantMin, int64_t montantMax,
                                                  const std::string& statut) {
    std::vector<Transaction> result;
    for (const auto& t : transactions) {
        if (t.compteSource != numero) continue;
        if (!type.empty() && t.type.find(type) == std::string::npos && t.operateur.find(type) == std::string::npos) continue;
        if (montantMin > 0 && t.montant < montantMin) continue;
        if (montantMax > 0 && t.montant > montantMax) continue;
        if (!statut.empty() && t.statut != statut) continue;
        result.push_back(t);
    }
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

int64_t Banque::getSolde(int numero) {
    Compte* c = trouverCompte(numero);
    return c ? c->solde : 0;
}

Banque::Stats Banque::getStats() {
    Stats s;
    s.nbComptesTotal = static_cast<int>(comptes.size());
    s.nbComptesActifs = 0;
    s.masseTotale = 0;
    for (const auto& c : comptes) {
        if (c.actif) s.nbComptesActifs++;
        s.masseTotale += c.solde;
    }
    s.nbTransactions = static_cast<int>(transactions.size());
    return s;
}
