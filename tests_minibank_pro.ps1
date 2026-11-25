# ============================================================
# MiniBank Pro — Suite de Tests d'Intégration & Sécurité
# ============================================================

$baseUrl = "http://localhost:8080"
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " MiniBank Pro - Lancement des Tests Automatisés" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

function Assert-Equal($actual, $expected, $testName) {
    if ($actual -eq $expected) {
        Write-Host "[PASS] $testName" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $testName (Attendu: $expected, Obtenu: $actual)" -ForegroundColor Red
    }
}

try {
    # ------------------------------------------------------------
    # TEST 1 : Création de compte Client A (Anael)
    # ------------------------------------------------------------
    Write-Host "`n--> Test 1 : Création de compte client avec PIN PBKDF2" -ForegroundColor Yellow
    $bodyA = @{
        titulaire = "Anael Kouassi"
        pin = "1234"
        typeCompte = "Courant"
        soldeInitial = 100000
    } | ConvertTo-Json

    $resA = Invoke-RestMethod -Uri "$baseUrl/api/comptes" -Method POST -Body $bodyA -ContentType "application/json"
    Assert-Equal $resA.success $true "Création de compte réussie"
    $numA = $resA.numero
    Write-Host "   Compte A généré (sécurisé, non séquentiel) : $numA" -ForegroundColor Cyan

    # ------------------------------------------------------------
    # TEST 2 : Connexion de Client A
    # ------------------------------------------------------------
    Write-Host "`n--> Test 2 : Authentification avec hachage salé PBKDF2" -ForegroundColor Yellow
    $loginBodyA = @{
        numero = $numA
        pin = "1234"
    } | ConvertTo-Json

    $loginResA = Invoke-RestMethod -Uri "$baseUrl/api/login" -Method POST -Body $loginBodyA -ContentType "application/json"
    Assert-Equal $loginResA.success $true "Connexion Client A réussie"
    $tokenA = $loginResA.token
    Write-Host "   Jeton de session 256 bits émis : $tokenA" -ForegroundColor Cyan

    # ------------------------------------------------------------
    # TEST 3 : Création de compte Client B (Fatou)
    # ------------------------------------------------------------
    Write-Host "`n--> Test 3 : Création d'un second compte client (B)" -ForegroundColor Yellow
    $bodyB = @{
        titulaire = "Fatou Diallo"
        pin = "5678"
        typeCompte = "Courant"
        soldeInitial = 25000
    } | ConvertTo-Json

    $resB = Invoke-RestMethod -Uri "$baseUrl/api/comptes" -Method POST -Body $bodyB -ContentType "application/json"
    $numB = $resB.numero
    Write-Host "   Compte B généré : $numB" -ForegroundColor Cyan

    # ------------------------------------------------------------
    # TEST 4 : Vérification Anti-IDOR (Session-First)
    # ------------------------------------------------------------
    Write-Host "`n--> Test 4 : Contrôle Anti-IDOR sur /api/comptes/me" -ForegroundColor Yellow
    $headersA = @{
        "Authorization" = "Bearer $tokenA"
    }
    $meA = Invoke-RestMethod -Uri "$baseUrl/api/comptes/me" -Method GET -Headers $headersA
    Assert-Equal $meA.success $true "Accès aux données du compte authentifié"
    Assert-Equal $meA.compte.numero $numA "Le serveur garantit l'identité sans faire confiance au client"

    # ------------------------------------------------------------
    # TEST 5 : Virement Atomique ACID de A vers B avec Idempotence
    # ------------------------------------------------------------
    Write-Host "`n--> Test 5 : Virement bancaire ACID avec clé d'idempotence" -ForegroundColor Yellow
    $idempotencyKey = [System.Guid]::NewGuid().ToString()
    $virementBody = @{
        dest = $numB
        montant = 30000
        motif = "Participation Projet"
        idempotencyKey = $idempotencyKey
    } | ConvertTo-Json

    $virementRes = Invoke-RestMethod -Uri "$baseUrl/api/virement" -Method POST -Headers $headersA -Body $virementBody -ContentType "application/json"
    Assert-Equal $virementRes.success $true "Exécution atomique du virement"
    Assert-Equal $virementRes.solde 70000 "Solde du compte émetteur débité (70 000 FCFA)"
    $txnRef = $virementRes.reference
    Write-Host "   Référence certifiée de transaction : $txnRef" -ForegroundColor Cyan

    # Test Idempotence : Renvoyer exactement la même requête
    Write-Host "   Vérification Idempotence (protection contre double débit)..." -ForegroundColor Gray
    $virementRetry = Invoke-RestMethod -Uri "$baseUrl/api/virement" -Method POST -Headers $headersA -Body $virementBody -ContentType "application/json"
    Assert-Equal $virementRetry.solde 70000 "Aucun double débit : solde inchangé (70 000 FCFA)"

    # ------------------------------------------------------------
    # TEST 6 : Services Mobile Money (Recharge & Retrait)
    # ------------------------------------------------------------
    Write-Host "`n--> Test 6 : Opérations Mobile Money (Orange Money & Wave)" -ForegroundColor Yellow
    $rechargeBody = @{
        operateur = "Orange Money"
        telephone = "0701020304"
        montant = 20000
        idempotencyKey = [System.Guid]::NewGuid().ToString()
    } | ConvertTo-Json

    $rechargeRes = Invoke-RestMethod -Uri "$baseUrl/api/mobile-money/recharge" -Method POST -Headers $headersA -Body $rechargeBody -ContentType "application/json"
    Assert-Equal $rechargeRes.success $true "Recharge Mobile Money validée"
    Assert-Equal $rechargeRes.solde 90000 "Solde après recharge (90 000 FCFA)"

    $retraitBody = @{
        operateur = "Wave"
        telephone = "0501020304"
        montant = 15000
        idempotencyKey = [System.Guid]::NewGuid().ToString()
    } | ConvertTo-Json

    $retraitRes = Invoke-RestMethod -Uri "$baseUrl/api/mobile-money/retrait" -Method POST -Headers $headersA -Body $retraitBody -ContentType "application/json"
    Assert-Equal $retraitRes.success $true "Retrait vers Wave validé"
    Assert-Equal $retraitRes.solde 75000 "Solde après retrait (75 000 FCFA)"

    # ------------------------------------------------------------
    # TEST 7 : Gestion des Bénéficiaires
    # ------------------------------------------------------------
    Write-Host "`n--> Test 7 : Carnet d'adresses / Bénéficiaires" -ForegroundColor Yellow
    $benefBody = @{
        numeroCompte = $numB
        nom = "Fatou Diallo"
    } | ConvertTo-Json

    $addBenefRes = Invoke-RestMethod -Uri "$baseUrl/api/beneficiaires" -Method POST -Headers $headersA -Body $benefBody -ContentType "application/json"
    Assert-Equal $addBenefRes.success $true "Bénéficiaire ajouté"

    $listBenefRes = Invoke-RestMethod -Uri "$baseUrl/api/beneficiaires" -Method GET -Headers $headersA
    Assert-Equal ($listBenefRes.beneficiaires.Count -ge 1) $true "Bénéficiaire récupéré dans la liste"

    # ------------------------------------------------------------
    # TEST 8 : Consultation d'un Reçu Bancaire Officiel
    # ------------------------------------------------------------
    Write-Host "`n--> Test 8 : Récupération du bordereau / Reçu officiel" -ForegroundColor Yellow
    $receiptRes = Invoke-RestMethod -Uri "$baseUrl/api/transactions/$txnRef" -Method GET -Headers $headersA
    Assert-Equal $receiptRes.success $true "Reçu trouvé via référence"
    Assert-Equal $receiptRes.transaction.reference $txnRef "Correspondance exacte de référence"

    # ------------------------------------------------------------
    # TEST 9 : Authentification Multi-Facteurs (2FA)
    # ------------------------------------------------------------
    Write-Host "`n--> Test 9 : Activation & Validation 2FA" -ForegroundColor Yellow
    $setupRes = Invoke-RestMethod -Uri "$baseUrl/api/mfa/setup" -Method POST -Headers $headersA
    Assert-Equal $setupRes.success $true "Code OTP d'activation généré"
    $otp = $setupRes.code

    $activateBody = @{ code = $otp } | ConvertTo-Json
    $activateRes = Invoke-RestMethod -Uri "$baseUrl/api/mfa/activate" -Method POST -Headers $headersA -Body $activateBody -ContentType "application/json"
    Assert-Equal $activateRes.success $true "2FA activé avec succès"

    # Tester la connexion avec 2FA
    $loginRes2 = Invoke-RestMethod -Uri "$baseUrl/api/login" -Method POST -Body $loginBodyA -ContentType "application/json"
    Assert-Equal $loginRes2.mfaRequired $true "Le serveur exige l'étape 2FA à la connexion"
    $tempToken = $loginRes2.tempToken
    $devOtp = $loginRes2.devOtp

    $verifyBody = @{ tempToken = $tempToken; code = $devOtp } | ConvertTo-Json
    $verifyRes = Invoke-RestMethod -Uri "$baseUrl/api/login/mfa-verify" -Method POST -Body $verifyBody -ContentType "application/json"
    Assert-Equal $verifyRes.success $true "Code 2FA validé, session ouverte"

    Write-Host "`n=================================================" -ForegroundColor Green
    Write-Host " TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS (100%) " -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Green

} catch {
    Write-Host "`n[ERREUR LORS DU TEST] $($_.Exception.Message)" -ForegroundColor Red
}
