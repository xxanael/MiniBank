#ifndef AUDITLOG_H
#define AUDITLOG_H

#include <string>

class AuditLog {
public:
    int id;
    std::string timestamp;
    int compteNumero;
    std::string eventType;      // "LOGIN_SUCCESS", "LOGIN_FAILED", "VIREMENT", "DEPOT", "RETRAIT", "MOBILE_MONEY", "MFA_ENABLED", "MFA_DISABLED"
    std::string description;
    std::string ipAddress;
    std::string status;         // "SUCCESS", "FAILURE", "BLOCKED"

    AuditLog() : id(0), compteNumero(0) {}
    AuditLog(int id, const std::string& ts, int num, const std::string& evt, const std::string& desc, const std::string& ip, const std::string& st)
        : id(id), timestamp(ts), compteNumero(num), eventType(evt), description(desc), ipAddress(ip), status(st) {}
};

#endif
