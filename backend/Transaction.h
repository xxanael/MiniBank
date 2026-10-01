#ifndef TRANSACTION_H
#define TRANSACTION_H

#include <string>

class Transaction {
public:
    int id;
    int compteSource;
    int compteDest;
    std::string type;
    double montant;
    std::string date;
    double soldeApres;

    Transaction();
    Transaction(int id, int src, int dest, const std::string& type,
                double montant, const std::string& date, double soldeApres);

    std::string toLine() const;
    static Transaction fromLine(const std::string& line);
};

#endif