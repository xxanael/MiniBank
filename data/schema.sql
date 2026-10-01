-- ============================================================
--  Mini Bank - Base de données MySQL / MariaDB
--  Exécution :  mysql -u root -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS minibank
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE minibank;

-- ------------------------------------------------------------
--  Utilisateur dédié à l'application (change le mot de passe !)
-- ------------------------------------------------------------
CREATE USER IF NOT EXISTS 'minibank'@'localhost'  IDENTIFIED BY 'minibank123';
CREATE USER IF NOT EXISTS 'minibank'@'127.0.0.1'  IDENTIFIED BY 'minibank123';
GRANT SELECT, INSERT, UPDATE ON minibank.* TO 'minibank'@'localhost';
GRANT SELECT, INSERT, UPDATE ON minibank.* TO 'minibank'@'127.0.0.1';
FLUSH PRIVILEGES;

-- ------------------------------------------------------------
--  Table des comptes (remplace data/comptes.txt)
--  - Les montants sont des entiers (FCFA, sans centimes)
--  - Le PIN n'est jamais stocké en clair : seulement son hash SHA-256
--  - Un compte fermé n'est pas supprimé (l'historique est conservé)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comptes (
    numero         BIGINT        NOT NULL AUTO_INCREMENT,
    nom            VARCHAR(60)   NOT NULL,
    prenom         VARCHAR(60)   NOT NULL,
    telephone      VARCHAR(20)   NULL,
    email          VARCHAR(100)  NULL,
    pin_hash       CHAR(64)      NOT NULL DEFAULT '',
    solde          BIGINT        NOT NULL DEFAULT 0,
    statut         ENUM('actif', 'ferme') NOT NULL DEFAULT 'actif',
    date_creation  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (numero),
    CONSTRAINT chk_solde_positif CHECK (solde >= 0)
) ENGINE = InnoDB AUTO_INCREMENT = 1000000001;

-- ------------------------------------------------------------
--  Table des transactions (remplace data/transactions.txt)
--  - DEPOT    : compte_dest est crédité
--  - RETRAIT  : compte_source est débité
--  - VIREMENT : compte_source est débité, compte_dest est crédité
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id              BIGINT      NOT NULL AUTO_INCREMENT,
    date_operation  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type            ENUM('DEPOT', 'RETRAIT', 'VIREMENT') NOT NULL,
    montant         BIGINT      NOT NULL,
    compte_source   BIGINT      NULL,
    compte_dest     BIGINT      NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_trans_source FOREIGN KEY (compte_source) REFERENCES comptes (numero),
    CONSTRAINT fk_trans_dest   FOREIGN KEY (compte_dest)   REFERENCES comptes (numero),
    CONSTRAINT chk_montant_positif CHECK (montant > 0)
) ENGINE = InnoDB;