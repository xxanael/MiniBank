#ifndef BENEFICIAIRE_H
#define BENEFICIAIRE_H

#include <string>

class Beneficiaire {
public:
    int id;
    int compteProprietaire;
    int numeroCompteCible;
    std::string nomAlias;
    std::string email;
    std::string dateAjout;

    Beneficiaire() : id(0), compteProprietaire(0), numeroCompteCible(0) {}
    Beneficiaire(int id, int prop, int cible, const std::string& alias, const std::string& mail, const std::string& date)
        : id(id), compteProprietaire(prop), numeroCompteCible(cible), nomAlias(alias), email(mail), dateAjout(date) {}
};

#endif
