#include "Crypto.h"
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/crypto.h>
#include <openssl/hmac.h>
#include <sstream>
#include <iomanip>
#include <random>
#include <chrono>
#include <cmath>
#include <cctype>
#include <algorithm>

static std::string bytesToHex(const unsigned char* data, size_t len) {
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (size_t i = 0; i < len; ++i) {
        oss << std::setw(2) << static_cast<int>(data[i]);
    }
    return oss.str();
}

std::string Crypto::generateSalt(size_t numBytes) {
    std::vector<unsigned char> buf(numBytes);
    if (RAND_bytes(buf.data(), static_cast<int>(numBytes)) != 1) {
        // Fallback sécurisé en cas de défaut RAND_bytes
        std::random_device rd;
        for (size_t i = 0; i < numBytes; ++i) buf[i] = static_cast<unsigned char>(rd() & 0xFF);
    }
    return bytesToHex(buf.data(), numBytes);
}

std::string Crypto::hashPin(const std::string& pin, const std::string& salt, int iterations) {
    unsigned char out[32];
    PKCS5_PBKDF2_HMAC(
        pin.c_str(), static_cast<int>(pin.length()),
        reinterpret_cast<const unsigned char*>(salt.c_str()), static_cast<int>(salt.length()),
        iterations,
        EVP_sha256(),
        sizeof(out), out
    );
    return bytesToHex(out, sizeof(out));
}

bool Crypto::verifyPin(const std::string& pin, const std::string& salt, const std::string& expectedHash) {
    std::string computed = hashPin(pin, salt);
    if (computed.length() != expectedHash.length()) return false;
    return CRYPTO_memcmp(computed.c_str(), expectedHash.c_str(), computed.length()) == 0;
}

std::string Crypto::generateToken(size_t numBytes) {
    std::vector<unsigned char> buf(numBytes);
    if (RAND_bytes(buf.data(), static_cast<int>(numBytes)) != 1) {
        std::random_device rd;
        for (size_t i = 0; i < numBytes; ++i) buf[i] = static_cast<unsigned char>(rd() & 0xFF);
    }
    return bytesToHex(buf.data(), numBytes);
}

std::string Crypto::generateOtp() {
    unsigned int val = 0;
    if (RAND_bytes(reinterpret_cast<unsigned char*>(&val), sizeof(val)) != 1) {
        std::random_device rd;
        val = rd();
    }
    int code = 100000 + (val % 900000);
    return std::to_string(code);
}

std::string Crypto::generateTxnReference() {
    auto now = std::chrono::system_clock::now();
    auto tt = std::chrono::system_clock::to_time_t(now);
    std::tm* tm = std::localtime(&tt);
    
    std::ostringstream oss;
    oss << "TXN-" << std::put_time(tm, "%Y%m%d") << "-";

    unsigned char randBuf[4];
    if (RAND_bytes(randBuf, sizeof(randBuf)) != 1) {
        std::random_device rd;
        for (int i = 0; i < 4; ++i) randBuf[i] = static_cast<unsigned char>(rd() & 0xFF);
    }
    oss << std::hex << std::uppercase << std::setfill('0');
    oss << std::setw(2) << static_cast<int>(randBuf[0]);
    oss << std::setw(2) << static_cast<int>(randBuf[1]);
    oss << "-" << std::setw(2) << static_cast<int>(randBuf[2]);
    oss << std::setw(2) << static_cast<int>(randBuf[3]);
    return oss.str();
}

std::string Crypto::generateUUID() {
    unsigned char b[16];
    if (RAND_bytes(b, 16) != 1) {
        std::random_device rd;
        for (int i = 0; i < 16; ++i) b[i] = static_cast<unsigned char>(rd() & 0xFF);
    }
    b[6] = (b[6] & 0x0F) | 0x40; // Version 4
    b[8] = (b[8] & 0x3F) | 0x80; // Variant RFC 4122

    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (int i = 0; i < 16; ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10) oss << "-";
        oss << std::setw(2) << static_cast<int>(b[i]);
    }
    return oss.str();
}

static const std::string BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

std::string Crypto::generateBase32Secret(size_t length) {
    std::string secret;
    secret.reserve(length);
    std::vector<unsigned char> buf(length);
    if (RAND_bytes(buf.data(), static_cast<int>(length)) != 1) {
        std::random_device rd;
        for (size_t i = 0; i < length; ++i) buf[i] = static_cast<unsigned char>(rd() & 0xFF);
    }
    for (size_t i = 0; i < length; ++i) {
        secret += BASE32_ALPHABET[buf[i] % 32];
    }
    return secret;
}

static std::vector<unsigned char> base32Decode(const std::string& input) {
    std::vector<unsigned char> output;
    int buffer = 0;
    int bitsLeft = 0;
    for (char c : input) {
        if (c == ' ' || c == '-' || c == '=') continue;
        char up = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
        size_t idx = BASE32_ALPHABET.find(up);
        if (idx == std::string::npos) continue;
        buffer = (buffer << 5) | (static_cast<int>(idx) & 0x1F);
        bitsLeft += 5;
        if (bitsLeft >= 8) {
            output.push_back(static_cast<unsigned char>((buffer >> (bitsLeft - 8)) & 0xFF));
            bitsLeft -= 8;
        }
    }
    return output;
}

std::string Crypto::calculateTOTP(const std::string& base32Secret, uint64_t timestamp, int digits) {
    std::vector<unsigned char> key = base32Decode(base32Secret);
    if (key.empty()) return "";

    uint64_t step = timestamp / 30;
    unsigned char challenge[8];
    for (int i = 7; i >= 0; --i) {
        challenge[i] = static_cast<unsigned char>(step & 0xFF);
        step >>= 8;
    }

    unsigned char hmacResult[EVP_MAX_MD_SIZE];
    unsigned int hmacLen = 0;
    HMAC(EVP_sha1(), key.data(), static_cast<int>(key.size()), challenge, 8, hmacResult, &hmacLen);

    int offset = hmacResult[hmacLen - 1] & 0x0F;
    uint32_t binary = ((hmacResult[offset] & 0x7F) << 24) |
                      ((hmacResult[offset + 1] & 0xFF) << 16) |
                      ((hmacResult[offset + 2] & 0xFF) << 8) |
                      (hmacResult[offset + 3] & 0xFF);

    uint32_t pin = binary % static_cast<uint32_t>(std::pow(10, digits));
    std::ostringstream oss;
    oss << std::setfill('0') << std::setw(digits) << pin;
    return oss.str();
}

bool Crypto::verifyTOTP(const std::string& base32Secret, const std::string& code, int windowSeconds) {
    if (code.length() != 6) return false;
    auto now = std::chrono::system_clock::now();
    uint64_t currentSec = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count());

    // Vérifie le pas actuel, -30s et +30s pour tolérer le léger décalage d'horloge
    for (int step = -1; step <= 1; ++step) {
        uint64_t t = currentSec + static_cast<uint64_t>(step * windowSeconds);
        if (calculateTOTP(base32Secret, t, 6) == code) {
            return true;
        }
    }
    return false;
}

std::string Crypto::getTotpUri(const std::string& secret, const std::string& accountName, const std::string& issuer) {
    return "otpauth://totp/" + issuer + ":" + accountName + "?secret=" + secret + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30";
}
