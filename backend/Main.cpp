#include "httplib.h"
#include "json.hpp"
#include "Banque.h"
#include <iostream>
#include <sstream>
#include <cstdlib>

using json = nlohmann::json;
using namespace httplib;

static Banque banque;

json parseBody(const Request& req) {
    try { return json::parse(req.body); }
    catch (...) { return json::object(); }
}

void setCORS(Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

json compteToJson(const Compte& c) {
    json j;
    j["numero"] = c.numero;
    j["titulaire"] = c.titulaire;
    j["solde"] = c.solde;
    j["typeCompte"] = c.typeCompte;
    j["actif"] = c.actif;
    j["isAdmin"] = c.isAdmin;
    return j;
}

json transactionToJson(const Transaction& t) {
    json j;
    j["id"] = t.id;
    j["compteSource"] = t.compteSource;
    j["compteDest"] = t.compteDest;
    j["type"] = t.type;
    j["montant"] = t.montant;
    j["date"] = t.date;
    j["soldeApres"] = t.soldeApres;
    return j;
}

int main() {
    Server svr;

    svr.Options(".*", [](const Request&, Response& res) {
        setCORS(res);
        res.status = 204;
    });

    svr.set_mount_point("/", "./frontend");

    // ============================================================
    // AUTHENTIFICATION
    // ============================================================
    svr.Post("/api/login", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        int numero = body.value("numero", 0);
        std::string pin = body.value("pin", "");

        if (banque.authentifier(numero, pin)) {
            Compte* c = banque.trouverCompte(numero);
            json j;
            j["numero"]     = c->numero;
            j["titulaire"]  = c->titulaire;
            j["solde"]      = c->solde;
            j["typeCompte"] = c->typeCompte;
            j["actif"]      = c->actif;
            j["isAdmin"]    = c->isAdmin;
            res.set_content(json{{"success", true}, {"compte", j}}.dump(),
                            "application/json");
        } else {
            res.status = 401;
            res.set_content(json{{"success", false},
                {"message", "Numero ou PIN invalide"}}.dump(), "application/json");
        }
    });

    // ============================================================
    // GESTION DES COMPTES (utilisateur + admin)
    // ============================================================

    // Créer un compte
    svr.Post("/api/comptes", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        std::string titulaire = body.value("titulaire", "");
        std::string pin = body.value("pin", "");
        std::string type = body.value("typeCompte", "Courant");
        double solde = body.value("soldeInitial", 0.0);
        int numeroForce = body.value("numeroForce", -1);
        bool isAdmin = body.value("isAdmin", false);

        if (titulaire.empty() || pin.length() != 4) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Donnees invalides (PIN = 4 chiffres)"}}.dump(),
                "application/json");
            return;
        }
        int num = banque.creerCompte(titulaire, pin, type, solde, numeroForce, isAdmin);
        if (num < 0) {
            res.status = 400;
            res.set_content(json{{"success", false},
                {"message", "Creation impossible"}}.dump(), "application/json");
            return;
        }
        res.set_content(json{{"success", true}, {"numero", num},
            {"message", "Compte cree avec succes"}}.dump(), "application/json");
    });

    // Liste de tous les comptes
    svr.Get("/api/comptes", [](const Request&, Response& res) {
        setCORS(res);
        json arr = json::array();
        for (const auto& c : banque.getTousComptes()) arr.push_back(compteToJson(c));
        res.set_content(json{{"success", true}, {"comptes", arr}}.dump(),
            "application/json");
    });

    // Détail d'un compte
    svr.Get(R"(/api/comptes/(\d+))", [](const Request& req, Response& res) {
        setCORS(res);
        int num = std::stoi(req.matches[1]);
        Compte* c = banque.trouverCompte(num);
        if (!c) {
            res.status = 404;
            res.set_content(json{{"success", false},
                {"message", "Compte introuvable"}}.dump(), "application/json");
            return;
        }
        res.set_content(json{{"success", true},
            {"compte", compteToJson(*c)}}.dump(), "application/json");
    });

    // Modifier un compte (titulaire, type)
    svr.Post(R"(/api/comptes/(\d+)/modifier)", [](const Request& req, Response& res) {
        setCORS(res);
        int num = std::stoi(req.matches[1]);
        auto body = parseBody(req);
        std::string titulaire = body.value("titulaire", "");
        std::string type = body.value("typeCompte", "");
        bool ok = banque.modifierCompte(num, titulaire, type);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Compte modifie" : "Echec modification"}}.dump(),
            "application/json");
    });

    // Fermer un compte (utilisateur)
    svr.Post(R"(/api/comptes/(\d+)/fermer)", [](const Request& req, Response& res) {
        setCORS(res);
        int num = std::stoi(req.matches[1]);
        bool ok = banque.fermerCompte(num);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Compte ferme" : "Solde non nul ou compte introuvable"}}.dump(),
            "application/json");
    });

    // ============================================================
    // OPÉRATIONS BANCAIRES
    // ============================================================

    // Dépôt
    svr.Post("/api/depot", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        int num = body.value("numero", 0);
        double montant = body.value("montant", 0.0);
        std::string msg;
        bool ok = banque.depot(num, montant, msg);
        double solde = banque.getSolde(num);
        res.set_content(json{{"success", ok}, {"message", msg},
            {"solde", solde}}.dump(), "application/json");
    });

    // Retrait
    svr.Post("/api/retrait", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        int num = body.value("numero", 0);
        double montant = body.value("montant", 0.0);
        std::string msg;
        bool ok = banque.retrait(num, montant, msg);
        double solde = banque.getSolde(num);
        res.set_content(json{{"success", ok}, {"message", msg},
            {"solde", solde}}.dump(), "application/json");
    });

    // Virement
    svr.Post("/api/virement", [](const Request& req, Response& res) {
        setCORS(res);
        auto body = parseBody(req);
        int src = body.value("source", 0);
        int dest = body.value("dest", 0);
        double montant = body.value("montant", 0.0);
        std::string msg;
        bool ok = banque.virement(src, dest, montant, msg);
        double solde = banque.getSolde(src);
        res.set_content(json{{"success", ok}, {"message", msg},
            {"solde", solde}}.dump(), "application/json");
    });

    // Historique d'un compte
    svr.Get(R"(/api/historique/(\d+))", [](const Request& req, Response& res) {
        setCORS(res);
        int num = std::stoi(req.matches[1]);
        json arr = json::array();
        for (const auto& t : banque.getHistorique(num)) arr.push_back(transactionToJson(t));
        res.set_content(json{{"success", true}, {"transactions", arr}}.dump(),
            "application/json");
    });

    // ============================================================
    // ROUTES ADMIN (préfixe /api/admin/)
    // ============================================================

    // Stats globales
    svr.Get("/api/admin/stats", [](const Request&, Response& res) {
        setCORS(res);
        auto stats = banque.getStats();
        json j;
        j["nbComptesTotal"] = stats.nbComptesTotal;
        j["nbComptesActifs"] = stats.nbComptesActifs;
        j["masseTotale"] = stats.masseTotale;
        j["nbTransactions"] = stats.nbTransactions;
        res.set_content(json{{"success", true}, {"stats", j}}.dump(),
                        "application/json");
    });

    // Toutes les transactions (admin)
    svr.Get("/api/admin/transactions", [](const Request&, Response& res) {
        setCORS(res);
        json arr = json::array();
        for (const auto& t : banque.getToutesTransactions()) {
            arr.push_back(transactionToJson(t));
        }
        res.set_content(json{{"success", true}, {"transactions", arr}}.dump(),
                        "application/json");
    });

    // Supprimer un compte (admin)
    svr.Post(R"(/api/admin/comptes/(\d+)/supprimer)", [](const Request& req, Response& res) {
        setCORS(res);
        int num = std::stoi(req.matches[1]);
        bool ok = banque.supprimerCompte(num);
        res.set_content(json{{"success", ok},
            {"message", ok ? "Compte supprime" : "Compte introuvable"}}.dump(),
            "application/json");
    });

    // Changer le numéro d'un compte (admin)
    svr.Post(R"(/api/admin/comptes/(\d+)/changer-numero)", [](const Request& req, Response& res) {
        setCORS(res);
        int ancienNum = std::stoi(req.matches[1]);
        auto body = parseBody(req);
        int nouveauNum = body.value("nouveauNumero", 0);
        std::string msg;
        bool ok = banque.changerNumero(ancienNum, nouveauNum, msg);
        res.set_content(json{{"success", ok}, {"message", msg}}.dump(),
                        "application/json");
    });

    // ============================================================
    // DÉMARRAGE DU SERVEUR
    // ============================================================
    std::cout << "=== Mini Bank Server ===" << std::endl;

    const char* port_env = std::getenv("PORT");
    int port = port_env ? std::atoi(port_env) : 8080;

    std::cout << "Server listening on http://0.0.0.0:" << port << std::endl;

    if (!svr.listen("0.0.0.0", port)) {
        std::cerr << "ERREUR: Impossible de démarrer le serveur sur le port " << port << std::endl;
        return 1;
    }

    return 0;
}