#ifndef CRYPTO_H
#define CRYPTO_H

#include <string>

class Crypto {
public:
    // Hachage sécurisé du PIN avec PBKDF2-HMAC-SHA256 et sel cryptographique
    static std::string hashPin(const std::string& pin, const std::string& salt, int iterations = 10000);

    // Génération d'un sel cryptographique aléatoire sécurisé (hexadécimal)
    static std::string generateSalt(size_t numBytes = 16);

    // Comparaison en temps constant (anti-timing attack)
    static bool verifyPin(const std::string& pin, const std::string& salt, const std::string& expectedHash);

    // Génération de jeton aléatoire de session (256-bit hex)
    static std::string generateToken(size_t numBytes = 32);

    // Génération de code OTP à 6 chiffres
    static std::string generateOtp();

    // Génération d'une référence publique de transaction unique (ex: TXN-20261125-9821-4401)
    static std::string generateTxnReference();

    // Génération d'un UUIDv4 pour clés d'idempotence
    static std::string generateUUID();

    // Authentification MFA TOTP (RFC 6238 - Google Authenticator)
    static std::string generateBase32Secret(size_t length = 16);
    static std::string calculateTOTP(const std::string& base32Secret, uint64_t timestamp, int digits = 6);
    static bool verifyTOTP(const std::string& base32Secret, const std::string& code, int windowSeconds = 30);
    static std::string getTotpUri(const std::string& secret, const std::string& accountName, const std::string& issuer = "MiniBank");
};

#endif
