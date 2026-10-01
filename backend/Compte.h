#ifndef COMPTE_H
#define COMPTE_H

#include <string>
#include <vector>

class Compte {
public:
    int numero;
    std::string titulaire;
    std::string pin;
    double solde;
    std::string typeCompte;
    bool actif;
    bool isAdmin;

    Compte();
    Compte(int numero, const std::string& titulaire, const std::string& pin,
           double solde, const std::string& type, bool actif, bool isAdmin = false);

    std::string toLine() const;
    static Compte fromLine(const std::string& line);
};

#endif