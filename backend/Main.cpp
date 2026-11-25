#include "httplib.h"
#include "json.hpp"
#include "Banque.h"
#include "Crypto.h"
#include <iostream>
#include <sstream>
#include <cstdlib>
#include <mutex>
#include <random>
#include <chrono>
#include <unordered_map>

using json = nlohmann::json;
using namespace httplib;

static Banque banque;

// ============================================================
// GESTION DES SESSIONS & SÉCURITÉ AUTHENTIFICATION
// ============================================================
struct Session {
    std::string token;
    int userNumero;
    bool isAdmin;
    std::string role;
    std::string ip;
    std::chrono::steady_clock::time_point expiresAt;
};

struct PendingMFA {
    std::string tempToken;
    int userNumero;
    std::string code;
    std::string secret;
    std::chrono::steady_clock::time_point expiresAt;
};

static std::mutex g_authMutex;
static std::unordered_map<std::string, Session> g_sessions;
static std::unordered_map<std::string, PendingMFA> g_pendingMFA;

bool getSessionFromReq(const Request& req, Session& outSession) {
    std::string token;
    if (req.has_header("Authorization")) {
        std::string auth = req.get_header_value("Authorization");
        if (auth.rfind("Bearer ", 0) == 0) {
            token = auth.substr(7);
        } else {
            token = auth;
        }
    } else if (req.has_header("X-Session-Token")) {
        token = req.get_header_value("X-Session-Token");
    }

    if (token.empty() && !req.body.empty()) {
        try {
            auto b = json::parse(req.body);
            if (b.contains("token") && b["token"].is_string()) {
                token = b["token"].get<std::string>();
            }
        } catch (...) {}
    }

    if (token.empty()) return false;

    std::lock_guard<std::mutex> lock(g_authMutex);
    auto it = g_sessions.find(token);
    if (it == g_sessions.end()) return false;

    auto now = std::chrono::steady_clock::now();
    if (now > it->second.expiresAt) {
        g_sessions.erase(it);
        return false;
    }
    // Session limitée à 1h d'activité (expiration glissante 60 minutes)
    it->second.expiresAt = now + std::chrono::hours(1);
    outSession = it->second;
    return true;
}

bool requireAuth(const Request& req, Response& res, Session& session) {
    if (!getSessionFromReq(req, session)) {
        res.status = 401;
        res.set_content(json{{"success", false},
            {"message", "Session invalide ou expirée. Veuillez vous reconnecter."}}.dump(),
            "application/json");
        return false;
    }
    return true;
}

bool requireAdmin(const Request& req, Response& res, Session& session) {
    if (!requireAuth(req, res, session)) return false;
    if (!session.isAdmin && session.role != "ADMIN") {
        res.status = 403;
        res.set_content(json{{"success", false},
            {"message", "Accès refusé : privilèges administrateur requis."}}.dump(),
            "application/json");
        return false;
    }
    return true;
}

json parseBody(const Request& req) {
    try { return json::parse(req.body); }
    catch (...) { return json::object(); }
}

void setCORS(Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token, Idempotency-Key");
    res.set_header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set_header("Pragma", "no-cache");
    res.set_header("Expires", "0");
    // En-têtes de sécurité recommandés OWASP
    res.set_header("X-Content-Type-Options", "nosniff");
    res.set_header("X-Frame-Options", "DENY");
    res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");
}

json compteToJson(const Compte& c) {
    json j;
    j["numero"] = c.numero;
    j["titulaire"] = c.titulaire;
    j["solde"] = c.solde;
    j["devise"] = c.devise;
    j["typeCompte"] = c.typeCompte;
    j["actif"] = c.actif;
    j["isAdmin"] = c.isAdmin;
    j["role"] = c.role;
    j["mfaEnabled"] = c.mfaEnabled;
    j["limiteVirementJour"] = c.limiteVirementJour;
    j["dateCreation"] = c.dateCreation;
    return j;
}

json transactionToJson(const Transaction& t) {
    json j;
    j["id"] = t.id;
    j["reference"] = t.reference;
    j["idempotencyKey"] = t.idempotencyKey;
    j["compteSource"] = t.compteSource;
    j["compteDest"] = t.compteDest;
    j["type"] = t.type;
    j["operateur"] = t.operateur;
    j["detailsCible"] = t.detailsCible;
    j["montant"] = t.montant;
    j["date"] = t.date;
    j["soldeApres"] = t.soldeApres;
    j["statut"] = t.statut;
    j["motif"] = t.motif;
    return j;
}

json beneficiaireToJson(const Beneficiaire& b) {
    json j;
    j["id"] = b.id;
    j["compteProprietaire"] = b.compteProprietaire;
    j["numeroCompteCible"] = b.numeroCompteCible;
    j["numeroCompte"] = b.numeroCompteCible;
    j["nomAlias"] = b.nomAlias;
    j["nom"] = b.nomAlias;
    j["email"] = b.email;
    j["dateAjout"] = b.dateAjout;
    return j;
}

json auditLogToJson(const AuditLog& a) {
    json j;
    j["id"] = a.id;
    j["timestamp"] = a.timestamp;
    j["date"] = a.timestamp;
    j["compteNumero"] = a.compteNumero;
    j["eventType"] = a.eventType;
    j["action"] = a.eventType;
    j["description"] = a.description;
    j["details"] = a.description;
    j["ipAddress"] = a.ipAddress;
    j["ip"] = a.ipAddress;
    j["status"] = a.status;
    j["niveau"] = a.status == "BLOCKED" ? "ALERT" : (a.status == "FAILURE" ? "WARN" : "INFO");
    return j;
}

int main() {
    Server svr;

    svr.Options(".*", [](const Request&, Response& res) {
        setCORS(res);
        res.status = 204;
    });

    Headers staticHeaders = {
        {"Cache-Control", "no-cache, no-store, must-revalidate"},
        {"Pragma", "no-cache"},
        {"Expires", "0"}
    };
    svr.set_mount_point("/", "./frontend", staticHeaders);
    svr.set_file_request_handler([](const Request&, Response& res) {
        res.set_header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.set_header("Pragma", "no-cache");
        res.set_header("Expires", "0");
    });

    // ============================================================
    // AUTHENTIFICATION, BRUTE-FORCE PROTECTION & 2FA / MFA
    // ============================================================
    svr.Post("/api/login", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        int numero = body.value("numero", 0);
        std::string pin = body.value("pin", "");

        std::string authMsg;
        AuthResult auth = banque.authentifier(numero, pin, authMsg);

        if (auth == AuthResult::ACCOUNT_LOCKED) {
            res.status = 423; // Locked
            res.set_content(json{{"success", false}, {"locked", true}, {"message", authMsg}}.dump(), "application/json");
            return;
        }

        if (auth != AuthResult::SUCCESS) {
            res.status = 401;
            res.set_content(json{{"success", false}, {"message", authMsg}}.dump(), "application/json");
            return;
        }

        Compte* c = banque.trouverCompte(numero);
        if (!c) {
            res.status = 401;
            res.set_content(json{{"success", false}, {"message", "Compte introuvable"}}.dump(), "application/json");
            return;
        }

        // Si l'utilisateur a activé le 2FA / TOTP (Google Authenticator)
        if (c->mfaEnabled) {
            std::string tempToken = Crypto::generateToken(16);
            auto expiresAt = std::chrono::steady_clock::now() + std::chrono::minutes(5);

            {
                std::lock_guard<std::mutex> lock(g_authMutex);
                g_pendingMFA[tempToken] = {tempToken, c->numero, "", c->mfaSecret, expiresAt};
            }

            banque.logAudit(c->numero, "MFA_TOTP_CHALLENGE", "Défi Google Authenticator requis");

            res.set_content(json{
                {"success", true},
                {"mfaRequired", true},
                {"tempToken", tempToken},
                {"message", "Veuillez saisir le code à 6 chiffres affiché sur votre application Google Authenticator."}
            }.dump(), "application/json");
            return;
        }

        // Pas de 2FA : émission de la session sécurisée (limitée à 1h d'activité)
        std::string token = Crypto::generateToken(32);
        auto expiresAt = std::chrono::steady_clock::now() + std::chrono::hours(1);
        {
            std::lock_guard<std::mutex> lock(g_authMutex);
            g_sessions[token] = {token, c->numero, c->isAdmin, c->role, req.remote_addr, expiresAt};
        }

        res.set_content(json{
            {"success", true},
            {"token", token},
            {"compte", compteToJson(*c)}
        }.dump(), "application/json");
    });

    svr.Post("/api/login/mfa-verify", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        std::string tempToken = body.value("tempToken", "");
        std::string code = body.value("code", "");

        int userNum = -1;
        std::string secret;
        {
            std::lock_guard<std::mutex> lock(g_authMutex);
            auto it = g_pendingMFA.find(tempToken);
            if (it == g_pendingMFA.end()) {
                res.status = 401;
                res.set_content(json{{"success", false},
                    {"message", "Session de validation 2FA expirée ou introuvable"}}.dump(), "application/json");
                return;
            }

            auto now = std::chrono::steady_clock::now();
            if (now > it->second.expiresAt) {
                g_pendingMFA.erase(it);
                res.status = 401;
                res.set_content(json{{"success", false},
                    {"message", "Session 2FA expirée. Veuillez vous reconnecter."}}.dump(), "application/json");
                return;
            }

            secret = it->second.secret;
            userNum = it->second.userNumero;
            if (!Crypto::verifyTOTP(secret, code)) {
                res.status = 401;
                res.set_content(json{{"success", false},
                    {"message", "Code Google Authenticator incorrect ou expiré."}}.dump(), "application/json");
                return;
            }

            g_pendingMFA.erase(it);
        }

        Compte* c = banque.trouverCompte(userNum);
        if (!c || !c->actif) {
            res.status = 401;
            res.set_content(json{{"success", false},
                {"message", "Compte inactif ou introuvable"}}.dump(), "application/json");
            return;
        }

        std::string token = Crypto::generateToken(32);
        auto expiresAt = std::chrono::steady_clock::now() + std::chrono::hours(1);
        {
            std::lock_guard<std::mutex> lock(g_authMutex);
            g_sessions[token] = {token, c->numero, c->isAdmin, c->role, req.remote_addr, expiresAt};
        }

        banque.logAudit(c->numero, "MFA_LOGIN_SUCCESS", "Validation Google Authenticator réussie");

        res.set_content(json{
            {"success", true},
            {"token", token},
            {"compte", compteToJson(*c)}
        }.dump(), "application/json");
    });

    svr.Post("/api/mfa/setup", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        Compte* c = banque.trouverCompte(session.userNumero);
        std::string secret = Crypto::generateBase32Secret(16);
        std::string uri = Crypto::getTotpUri(secret, std::to_string(session.userNumero) + " (" + (c ? c->titulaire : "MiniBank") + ")");
        auto expiresAt = std::chrono::steady_clock::now() + std::chrono::minutes(10);

        std::string setupKey = "setup_" + std::to_string(session.userNumero);
        {
            std::lock_guard<std::mutex> lock(g_authMutex);
            g_pendingMFA[setupKey] = {setupKey, session.userNumero, "", secret, expiresAt};
        }

        res.set_content(json{
            {"success", true},
            {"secret", secret},
            {"uri", uri},
            {"message", "Scannez le QR Code ou saisissez la clé secrète dans Google Authenticator"}
        }.dump(), "application/json");
    });

    svr.Post("/api/mfa/activate", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        auto body = parseBody(req);
        std::string code = body.value("code", "");
        std::string setupKey = "setup_" + std::to_string(session.userNumero);

        std::string secret;
        {
            std::lock_guard<std::mutex> lock(g_authMutex);
            auto it = g_pendingMFA.find(setupKey);
            if (it == g_pendingMFA.end()) {
                res.status = 400;
                res.set_content(json{{"success", false},
                    {"message", "Session de configuration 2FA introuvable ou expirée."}}.dump(), "application/json");
                return;
            }
            secret = it->second.secret;
            if (!Crypto::verifyTOTP(secret, code)) {
                res.status = 400;
                res.set_content(json{{"success", false},
                    {"message", "Code Google Authenticator incorrect ou expiré."}}.dump(), "application/json");
                return;
            }
            g_pendingMFA.erase(it);
        }

        banque.activerMFA(session.userNumero, secret);
        banque.logAudit(session.userNumero, "MFA_TOTP_ENABLED", "Double facteur Google Authenticator (TOTP) activé");
        res.set_content(json{{"success", true},
            {"message", "Authentification Google Authenticator (TOTP) activée avec succès."}}.dump(), "application/json");
    });

    svr.Post("/api/mfa/disable", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        auto body = parseBody(req);
        std::string pin = body.value("pin", "");

        std::string authMsg;
        if (banque.authentifier(session.userNumero, pin, authMsg) != AuthResult::SUCCESS) {
            res.status = 401;
            res.set_content(json{{"success", false},
                {"message", "Code PIN incorrect pour désactiver le 2FA."}}.dump(), "application/json");
            return;
        }

        banque.desactiverMFA(session.userNumero);
        res.set_content(json{{"success", true},
            {"message", "Authentification 2FA désactivée."}}.dump(), "application/json");
    });

    // Changer son code PIN
    svr.Post("/api/compte/changer-pin", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        auto body = parseBody(req);
        std::string ancien = body.value("ancienPin", "");
        std::string nouveau = body.value("nouveauPin", "");

        std::string msg;
        bool ok = banque.changerPin(session.userNumero, ancien, nouveau, msg);
        res.set_content(json{{"success", ok}, {"message", msg}}.dump(), "application/json");
    });

    // ============================================================
    // GESTION DES COMPTES (Anti-IDOR)
    // ============================================================

    // Créer un compte
    svr.Post("/api/comptes", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        std::string titulaire = body.value("titulaire", "");
        std::string pin = body.value("pin", "");
        std::string type = body.value("typeCompte", "Courant");
        int64_t solde = body.value("soldeInitial", 0LL);
        int numeroForce = body.value("numeroForce", -1);
        bool isAdmin = body.value("isAdmin", false);
        std::string role = body.value("role", "CLIENT");

        Session session;
        bool isCallerAdmin = (getSessionFromReq(req, session) && session.isAdmin);
        if (!isCallerAdmin) {
            numeroForce = -1;
            isAdmin = false;
            role = "CLIENT";
        }

        if (titulaire.empty() || pin.length() != 4) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Données invalides (Le PIN doit comporter exactement 4 chiffres)"}}.dump(),
                "application/json");
            return;
        }
        int num = banque.creerCompte(titulaire, pin, type, solde, numeroForce, isAdmin, role);
        if (num < 0) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Impossible de créer ce compte"}}.dump(), "application/json");
            return;
        }
        res.set_content(json{{"success", true}, {"numero", num},
            {"message", "Compte bancaire ouvert avec succès"}}.dump(), "application/json");
    });

    // Liste des comptes (Admin uniquement)
    svr.Get("/api/comptes", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        json arr = json::array();
        for (const auto& c : banque.getTousComptes()) arr.push_back(compteToJson(c));
        res.set_content(json{{"success", true}, {"comptes", arr}}.dump(), "application/json");
    });

    // Profil de l'utilisateur connecté
    svr.Get("/api/comptes/me", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        Compte* c = banque.trouverCompte(session.userNumero);
        if (!c) {
            res.status = 404;
            res.set_content(json{{"success", false}, {"message", "Compte introuvable"}}.dump(), "application/json");
            return;
        }
        res.set_content(json{{"success", true}, {"compte", compteToJson(*c)}}.dump(), "application/json");
    });

    // Détail d'un compte (avec vérification stricte anti-IDOR)
    svr.Get(R"(/api/comptes/(\d+))", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        if (!session.isAdmin && session.userNumero != num) {
            res.status = 403;
            res.set_content(json{{"success", false},
                {"message", "Accès refusé : vous n'êtes pas autorisé à consulter ce compte."}}.dump(),
                "application/json");
            return;
        }

        Compte* c = banque.trouverCompte(num);
        if (!c) {
            res.status = 404;
            res.set_content(json{{"success", false}, {"message", "Compte introuvable"}}.dump(), "application/json");
            return;
        }
        res.set_content(json{{"success", true}, {"compte", compteToJson(*c)}}.dump(), "application/json");
    });

    // Modifier un compte
    svr.Post(R"(/api/comptes/(\d+)/modifier)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        if (!session.isAdmin && session.userNumero != num) {
            res.status = 403;
            res.set_content(json{{"success", false},
                {"message", "Accès refusé : vous n'êtes pas autorisé à modifier ce compte."}}.dump(),
                "application/json");
            return;
        }

        auto body = parseBody(req);
        std::string titulaire = body.value("titulaire", "");
        std::string type = body.value("typeCompte", "");
        bool ok = banque.modifierCompte(num, titulaire, type);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Profil mis à jour" : "Échec de modification"}}.dump(),
            "application/json");
    });

    // Clôturer un compte
    svr.Post(R"(/api/comptes/(\d+)/fermer)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        if (!session.isAdmin && session.userNumero != num) {
            res.status = 403;
            res.set_content(json{{"success", false},
                {"message", "Accès refusé : vous n'êtes pas autorisé à fermer ce compte."}}.dump(),
                "application/json");
            return;
        }

        bool ok = banque.fermerCompte(num);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Compte clôturé avec succès" : "Solde non nul ou compte introuvable"}}.dump(),
            "application/json");
    });

    // ============================================================
    // OPÉRATIONS BANCAIRES & TRANSACTIONS ACID
    // ============================================================

    // Dépôt
    svr.Post("/api/depot", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas effectuer d'opérations bancaires directes."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int num = session.userNumero;
        int64_t montant = body.value("montant", 0LL);
        std::string idemKey = req.has_header("Idempotency-Key") ? req.get_header_value("Idempotency-Key") : body.value("idempotencyKey", "");

        std::string msg;
        bool ok = banque.depot(num, montant, msg, idemKey);
        int64_t solde = banque.getSolde(num);
        std::string ref = ok ? banque.getDerniereReference(num) : "";
        res.set_content(json{{"success", ok}, {"message", msg}, {"solde", solde}, {"reference", ref}}.dump(), "application/json");
    });

    // Retrait
    svr.Post("/api/retrait", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas effectuer d'opérations bancaires directes."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int num = session.userNumero;
        int64_t montant = body.value("montant", 0LL);
        std::string idemKey = req.has_header("Idempotency-Key") ? req.get_header_value("Idempotency-Key") : body.value("idempotencyKey", "");

        std::string msg;
        bool ok = banque.retrait(num, montant, msg, idemKey);
        int64_t solde = banque.getSolde(num);
        std::string ref = ok ? banque.getDerniereReference(num) : "";
        res.set_content(json{{"success", ok}, {"message", msg}, {"solde", solde}, {"reference", ref}}.dump(), "application/json");
    });

    // Prévisualisation / Validation d'un virement avant exécution
    svr.Post("/api/virement/preview", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas émettre de virements."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int dest = body.value("dest", 0);
        int64_t montant = body.value("montant", 0LL);

        if (dest <= 0) {
            res.set_content(json{{"success", false}, {"message", "Numéro de compte destinataire invalide"}}.dump(), "application/json");
            return;
        }
        if (dest == session.userNumero) {
            res.set_content(json{{"success", false}, {"message", "Impossible de virer vers votre propre compte"}}.dump(), "application/json");
            return;
        }
        if (montant <= 0) {
            res.set_content(json{{"success", false}, {"message", "Montant de virement invalide"}}.dump(), "application/json");
            return;
        }

        Compte* cd = banque.trouverCompte(dest);
        if (!cd || !cd->actif) {
            res.set_content(json{{"success", false}, {"message", "Compte destinataire inexistant ou inactif"}}.dump(), "application/json");
            return;
        }

        Compte* cs = banque.trouverCompte(session.userNumero);
        if (!cs || cs->solde < montant) {
            res.set_content(json{{"success", false}, {"message", "Solde disponible insuffisant"}}.dump(), "application/json");
            return;
        }

        int64_t dejaVire = banque.getSommeVirementsAujourdhui(session.userNumero);
        if (dejaVire + montant > cs->limiteVirementJour) {
            res.set_content(json{{"success", false},
                {"message", "Plafond journalier dépassé (Limite: " + std::to_string(cs->limiteVirementJour) + " FCFA)"}}.dump(), "application/json");
            return;
        }

        res.set_content(json{
            {"success", true},
            {"destNumero", cd->numero},
            {"destTitulaire", cd->titulaire},
            {"montant", montant},
            {"soldeActuel", cs->solde},
            {"soldeApres", cs->solde - montant},
            {"message", "Virement validé, prêt pour confirmation"}
        }.dump(), "application/json");
    });

    // Exécution d'un virement atomique ACID
    svr.Post("/api/virement", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas émettre de virements."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int src = session.userNumero; // Strictement imposé par le serveur
        int dest = body.value("dest", 0);
        int64_t montant = body.value("montant", 0LL);
        std::string motif = body.value("motif", "");
        std::string idemKey = req.has_header("Idempotency-Key") ? req.get_header_value("Idempotency-Key") : body.value("idempotencyKey", "");

        std::string msg;
        bool ok = banque.virement(src, dest, montant, msg, motif, idemKey);
        int64_t solde = banque.getSolde(src);
        std::string ref = ok ? banque.getDerniereReference(src) : "";
        res.set_content(json{{"success", ok}, {"message", msg}, {"solde", solde}, {"reference", ref}}.dump(), "application/json");
    });

    // Historique d'un compte avec filtres avancés
    svr.Get(R"(/api/historique/(\d+))", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        if (!session.isAdmin && session.userNumero != num) {
            res.status = 403;
            res.set_content(json{{"success", false},
                {"message", "Accès refusé : consultation restreinte à votre propre compte."}}.dump(),
                "application/json");
            return;
        }

        std::string type = req.get_param_value("type");
        int64_t minM = req.has_param("min") ? std::stoll(req.get_param_value("min")) : 0LL;
        int64_t maxM = req.has_param("max") ? std::stoll(req.get_param_value("max")) : 0LL;
        std::string statut = req.get_param_value("statut");

        json arr = json::array();
        for (const auto& t : banque.filtrerHistorique(num, type, minM, maxM, statut)) {
            arr.push_back(transactionToJson(t));
        }
        res.set_content(json{{"success", true}, {"transactions", arr}}.dump(), "application/json");
    });

    // Détail d'une transaction spécifique pour émission de reçu PDF
    svr.Get(R"(/api/transactions/([A-Za-z0-9\-]+))", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        std::string ref = req.matches[1];
        Transaction* t = banque.trouverTransactionParRef(ref);
        if (!t) {
            res.status = 404;
            res.set_content(json{{"success", false}, {"message", "Transaction introuvable"}}.dump(), "application/json");
            return;
        }

        // Vérification de propriété
        if (!session.isAdmin && t->compteSource != session.userNumero && t->compteDest != session.userNumero) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Accès interdit à ce reçu de transaction."}}.dump(), "application/json");
            return;
        }

        Compte* cs = banque.trouverCompte(t->compteSource);
        Compte* cd = t->compteDest > 0 ? banque.trouverCompte(t->compteDest) : nullptr;

        json j = transactionToJson(*t);
        j["sourceTitulaire"] = cs ? cs->titulaire : "Guichet / DAB";
        j["destTitulaire"] = cd ? cd->titulaire : (t->detailsCible.empty() ? "Externe" : t->detailsCible);
        j["devise"] = cs ? cs->devise : "FCFA";

        res.set_content(json{{"success", true}, {"transaction", j}}.dump(), "application/json");
    });

    // ============================================================
    // BÉNÉFICIAIRES FAVORIS
    // ============================================================
    svr.Get("/api/beneficiaires", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        json arr = json::array();
        for (const auto& b : banque.getBeneficiaires(session.userNumero)) {
            arr.push_back(beneficiaireToJson(b));
        }
        res.set_content(json{{"success", true}, {"beneficiaires", arr}}.dump(), "application/json");
    });

    svr.Post("/api/beneficiaires", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        auto body = parseBody(req);
        int cible = 0;
        if (body.contains("numeroCompteCible")) cible = body["numeroCompteCible"].get<int>();
        else if (body.contains("numeroCompte")) cible = body["numeroCompte"].get<int>();
        else if (body.contains("numero")) cible = body["numero"].get<int>();

        std::string alias = "";
        if (body.contains("nomAlias")) alias = body["nomAlias"].get<std::string>();
        else if (body.contains("nom")) alias = body["nom"].get<std::string>();

        std::string email = body.value("email", "");

        std::string msg;
        bool ok = banque.ajouterBeneficiaire(session.userNumero, cible, alias, email, msg);
        res.set_content(json{{"success", ok}, {"message", msg}}.dump(), "application/json");
    });

    svr.Delete(R"(/api/beneficiaires/(\d+))", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int id = std::stoi(req.matches[1]);
        bool ok = banque.supprimerBeneficiaire(session.userNumero, id);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Bénéficiaire supprimé" : "Bénéficiaire introuvable"}}.dump(),
            "application/json");
    });

    svr.Post(R"(/api/beneficiaires/(\d+)/supprimer)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;

        int id = std::stoi(req.matches[1]);
        bool ok = banque.supprimerBeneficiaire(session.userNumero, id);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Bénéficiaire supprimé" : "Bénéficiaire introuvable"}}.dump(),
            "application/json");
    });

    // ============================================================
    // MOBILE MONEY (Orange Money, MTN MoMo, Wave, Moov)
    // ============================================================
    svr.Post("/api/mobile-money/recharge", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas effectuer d'opérations Mobile Money."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int num = session.userNumero;
        std::string operateur = body.value("operateur", "Orange Money");
        std::string telephone = body.value("telephone", "");
        int64_t montant = body.value("montant", 0LL);
        std::string idemKey = req.has_header("Idempotency-Key") ? req.get_header_value("Idempotency-Key") : body.value("idempotencyKey", "");

        std::string msg;
        bool ok = banque.rechargeMobileMoney(num, operateur, telephone, montant, msg, idemKey);
        int64_t solde = banque.getSolde(num);
        std::string ref = ok ? banque.getDerniereReference(num) : "";
        res.set_content(json{{"success", ok}, {"message", msg}, {"solde", solde}, {"reference", ref}}.dump(), "application/json");
    });

    svr.Post("/api/mobile-money/retrait", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAuth(req, res, session)) return;
        if (session.isAdmin) {
            res.status = 403;
            res.set_content(json{{"success", false}, {"message", "Action non autorisée : Le compte administrateur ne peut pas effectuer d'opérations Mobile Money."}}.dump(), "application/json");
            return;
        }

        auto body = parseBody(req);
        int num = session.userNumero;
        std::string operateur = body.value("operateur", "Orange Money");
        std::string telephone = body.value("telephone", "");
        int64_t montant = body.value("montant", 0LL);
        std::string idemKey = req.has_header("Idempotency-Key") ? req.get_header_value("Idempotency-Key") : body.value("idempotencyKey", "");

        std::string msg;
        bool ok = banque.retraitMobileMoney(num, operateur, telephone, montant, msg, idemKey);
        int64_t solde = banque.getSolde(num);
        std::string ref = ok ? banque.getDerniereReference(num) : "";
        res.set_content(json{{"success", ok}, {"message", msg}, {"solde", solde}, {"reference", ref}}.dump(), "application/json");
    });

    // ============================================================
    // ROUTES ADMINISTRATION & AUDIT TRAIL
    // ============================================================
    svr.Get("/api/admin/stats", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        auto stats = banque.getStats();
        json j;
        j["nbComptesTotal"] = stats.nbComptesTotal;
        j["nbComptesActifs"] = stats.nbComptesActifs;
        j["masseTotale"] = stats.masseTotale;
        j["nbTransactions"] = stats.nbTransactions;
        res.set_content(json{{"success", true}, {"stats", j}}.dump(), "application/json");
    });

    svr.Get("/api/admin/transactions", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        json arr = json::array();
        for (const auto& t : banque.getToutesTransactions()) {
            arr.push_back(transactionToJson(t));
        }
        res.set_content(json{{"success", true}, {"transactions", arr}}.dump(), "application/json");
    });

    svr.Get("/api/admin/audit-logs", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        json arr = json::array();
        for (const auto& al : banque.getAuditLogs()) {
            arr.push_back(auditLogToJson(al));
        }
        res.set_content(json{{"success", true}, {"logs", arr}}.dump(), "application/json");
    });

    svr.Post(R"(/api/admin/comptes/(\d+)/supprimer)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        if (num == session.userNumero) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Impossible de supprimer votre propre compte administrateur"}}.dump(),
                "application/json");
            return;
        }
        bool ok = banque.supprimerCompte(num);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Compte supprimé avec succès" : "Compte introuvable"}}.dump(),
            "application/json");
    });

    svr.Post(R"(/api/admin/comptes/(\d+)/status)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        int num = std::stoi(req.matches[1]);
        auto body = parseBody(req);
        bool actif = body.value("actif", true);
        std::string msg;
        bool ok = banque.setCompteStatut(num, actif, msg);
        res.set_content(json{{"success", ok}, {"message", msg}}.dump(), "application/json");
    });

    svr.Post("/api/admin/comptes/creer", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        auto body = parseBody(req);
        std::string titulaire = body.value("titulaire", "");
        std::string pin = body.value("pin", "1234");
        std::string typeCompte = body.value("typeCompte", "Courant");
        int64_t soldeInitial = body.value("soldeInitial", 0LL);

        if (titulaire.empty() || pin.length() != 4) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Données invalides : Le nom est requis et le PIN doit être de 4 chiffres"}}.dump(),
                "application/json");
            return;
        }

        int num = banque.creerCompte(titulaire, pin, typeCompte, soldeInitial, -1, false, "CLIENT");
        if (num < 0) {
            res.status = 400;
            res.set_content(json{{"success", false}, {"message", "Échec de l'ouverture du compte"}}.dump(), "application/json");
            return;
        }

        res.set_content(json{{"success", true}, {"numero", num},
            {"message", "Compte client ouvert avec succès par l'administrateur"}}.dump(), "application/json");
    });

    svr.Post(R"(/api/admin/comptes/(\d+)/changer-numero)", [](const Request& req, Response& res) {
        setCORS(res);
        Session session;
        if (!requireAdmin(req, res, session)) return;

        int ancienNum = std::stoi(req.matches[1]);
        auto body = parseBody(req);
        int nouveauNum = body.value("nouveauNumero", 0);
        std::string msg;
        bool ok = banque.changerNumero(ancienNum, nouveauNum, msg);
        res.set_content(json{{"success", ok}, {"message", msg}}.dump(), "application/json");
    });

    // ============================================================
    // DÉMARRAGE DU SERVEUR
    // ============================================================
    std::cout << "=== Mini Bank Server Pro ===" << std::endl;

    const char* port_env = std::getenv("PORT");
    int port = port_env ? std::atoi(port_env) : 8080;

    std::cout << "Server listening on http://0.0.0.0:" << port << std::endl;

    if (!svr.listen("0.0.0.0", port)) {
        std::cerr << "ERREUR: Impossible de démarrer le serveur sur le port " << port << std::endl;
        return 1;
    }

    return 0;
}
