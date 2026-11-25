// ============================================================
// MiniBank Pro — Frontend JavaScript (Architecture FinTech & Sécurisée)
// ============================================================

const API = "";
let currentUser = null;
let adminUser = null;
let authToken = localStorage.getItem("minibank_token") || null;
let pendingMfaTempToken = null;
let isBalanceMasked = localStorage.getItem("minibank_masked") === "true";
let savedBeneficiaries = [];
let allTransactions = [];
let pendingTransferData = null;

// ------------------------------------------------------------
// HELPERS FORMATTAGE & UTILITAIRES
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function formatFCFA(montant) {
  const n = Math.round(Number(montant) || 0);
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

function escapeHtml(value) {
  return String(value ?? " ").replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function typeCompteLabel(type) {
  const labels = {
    'Courant': 'Compte Courant',
    'Epargne': "Compte d'Épargne",
    'Épargne': "Compte d'Épargne",
    'Admin': 'Compte Administrateur'
  };
  return labels[type] || type || "Compte Courant";
}

function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function transactionMeta(type) {
  if (!type) return { label: 'Opération', badge: 'badge-neutral', amount: 'amount-neutral', sign: '' };

  if (type.startsWith('Recharge Mobile Money') || type.startsWith('Recharge')) {
    return { label: type, badge: 'badge-in', amount: 'amount-positive', sign: '+' };
  }
  if (type.startsWith('Retrait Mobile Money')) {
    return { label: type, badge: 'badge-out', amount: 'amount-negative', sign: '-' };
  }
  const map = {
    'Depot': { label: 'Dépôt Espèces', badge: 'badge-in', amount: 'amount-positive', sign: '+' },
    'Depot initial': { label: 'Dépôt initial', badge: 'badge-in', amount: 'amount-positive', sign: '+' },
    'Retrait': { label: 'Retrait Espèces (GAB)', badge: 'badge-out', amount: 'amount-negative', sign: '-' },
    'Virement emis': { label: 'Virement Émis', badge: 'badge-out', amount: 'amount-negative', sign: '-' },
    'Virement recu': { label: 'Virement Reçu', badge: 'badge-in', amount: 'amount-positive', sign: '+' }
  };
  return map[type] || { label: type, badge: 'badge-neutral', amount: 'amount-neutral', sign: '' };
}

// ------------------------------------------------------------
// APPEL API SÉCURISÉ (AUTHENTIFICATION PAR JETON & ANTI-IDOR)
// ------------------------------------------------------------
async function apiCall(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
    headers["X-Session-Token"] = authToken;
  }
  const opts = { method, headers };
  if (body) {
    if (authToken && typeof body === "object" && !Array.isArray(body) && !body.token) {
      body.token = authToken;
    }
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(API + path, opts);
    if (res.status === 401 && !path.startsWith("/api/login")) {
      logout();
      return { success: false, message: "Session expirée. Veuillez vous reconnecter." };
    }
    return await res.json();
  } catch (e) {
    console.error("API error:", e);
    return { success: false, message: "Erreur de communication avec le serveur bancaire." };
  }
}

function showNotification(id, message, type = "success") {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.className = "notification show " + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.className = "notification";
  }, 5000);
}

// ------------------------------------------------------------
// GESTION DU MASQUAGE DU SOLDE (PRIVACY MODE)
// ------------------------------------------------------------
function toggleBalanceMask() {
  isBalanceMasked = !isBalanceMasked;
  localStorage.setItem("minibank_masked", isBalanceMasked ? "true" : "false");
  renderBalanceDisplay();
}

function renderBalanceDisplay() {
  if (!currentUser) return;
  const balEl = $("balance-amount");
  if (!balEl) return;

  if (isBalanceMasked) {
    balEl.textContent = "•••••••• FCFA";
    balEl.title = "Cliquez sur l'icône oeil pour afficher le solde";
  } else {
    balEl.textContent = formatFCFA(currentUser.solde);
    balEl.title = "";
  }
}

// ------------------------------------------------------------
// NAVIGATION ET ONGLETS
// ------------------------------------------------------------
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = $(id);
  if (el) el.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setTab(prefix, target) {
  document.querySelectorAll(`.nav-item[data-${prefix}]`).forEach(item => {
    const active = item.dataset[prefix] === target;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll(`.tab-content[id^="${prefix}-"]`).forEach(c => {
    c.classList.toggle("active", c.id === `${prefix}-${target}`);
  });

  if (prefix === "tab") {
    if (target === "history") loadHistorique();
    if (target === "virements") loadBeneficiaires();
    if (target === "dashboard") refreshAccount();
  } else if (prefix === "atab") {
    if (target === "comptes") loadAdminComptes();
    if (target === "transactions") loadAdminTransactions();
    if (target === "audit") loadAdminAuditLogs();
  }
}

// ------------------------------------------------------------
// AUTHENTIFICATION & 2FA / MFA
// ------------------------------------------------------------
async function login() {
  const numero = parseInt($("login-numero").value);
  const pin = $("login-pin").value;
  const errEl = $("login-error");

  if (!numero || pin.length !== 4) {
    errEl.textContent = "Veuillez saisir votre numéro de compte et votre PIN à 4 chiffres.";
    errEl.className = "form-msg error";
    return;
  }

  errEl.textContent = "";
  const submitBtn = $("btn-login-submit");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Authentification en cours...";
  }

  const data = await apiCall("/api/login", "POST", { numero, pin });

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Se connecter`;
  }

  if (data.success) {
    errEl.textContent = "";

    // Cas où le 2FA est requis
    if (data.mfaRequired) {
      pendingMfaTempToken = data.tempToken;
      $("login-form-main").style.display = "none";
      $("login-form-mfa").style.display = "block";
      $("login-mfa-code").value = "";
      $("login-mfa-error").textContent = "";

      const simAlert = $("mfa-sim-alert");
      if (simAlert) {
        simAlert.textContent = data.devOtp
          ? `[Simulation OTP Sécurisé] Votre code 2FA : ${data.devOtp}`
          : "Un code de validation vous a été transmis. Saisissez-le ci-dessous.";
      }
      $("login-mfa-code").focus();
      return;
    }

    // Connexion immédiate
    authToken = data.token;
    localStorage.setItem("minibank_token", authToken);
    localStorage.setItem("minibank_user", JSON.stringify(data.compte));

    if (data.compte.isAdmin) {
      adminUser = data.compte;
      enterAdminDashboard();
    } else {
      currentUser = data.compte;
      enterDashboard();
    }
  } else {
    errEl.textContent = data.message || "Identifiants invalides.";
    errEl.className = "form-msg error";
  }
}

async function verifyMFA() {
  const code = $("login-mfa-code").value.trim();
  const errEl = $("login-mfa-error");

  if (!code || code.length !== 6) {
    errEl.textContent = "Veuillez entrer le code de sécurité à 6 chiffres.";
    return;
  }

  const data = await apiCall("/api/login/mfa-verify", "POST", {
    tempToken: pendingMfaTempToken,
    code
  });

  if (data.success) {
    errEl.textContent = "";
    authToken = data.token;
    localStorage.setItem("minibank_token", authToken);
    localStorage.setItem("minibank_user", JSON.stringify(data.compte));
    cancelMFA();

    if (data.compte.isAdmin) {
      adminUser = data.compte;
      enterAdminDashboard();
    } else {
      currentUser = data.compte;
      enterDashboard();
    }
  } else {
    errEl.textContent = data.message || "Code invalide ou expiré.";
  }
}

function cancelMFA() {
  pendingMfaTempToken = null;
  $("login-form-mfa").style.display = "none";
  $("login-form-main").style.display = "block";
  $("login-mfa-code").value = "";
  $("login-mfa-error").textContent = "";
}

async function createAccount() {
  const titulaire = $("create-titulaire").value.trim();
  const pin = $("create-pin").value;
  const typeCompte = $("create-type").value;
  const soldeInitial = parseFloat($("create-solde").value) || 0;
  const msgEl = $("create-msg");

  if (!titulaire) {
    msgEl.textContent = "Le nom complet du titulaire est requis.";
    msgEl.className = "form-msg error";
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    msgEl.textContent = "Le PIN doit contenir exactement 4 chiffres.";
    msgEl.className = "form-msg error";
    return;
  }

  const data = await apiCall("/api/comptes", "POST", {
    titulaire, pin, typeCompte, soldeInitial
  });

  if (data.success) {
    msgEl.className = "form-msg success";
    msgEl.textContent = `Compte ouvert avec succès ! Identifiant bancaire : ${data.numero}`;
    setTimeout(() => {
      $("login-numero").value = data.numero;
      $("login-pin").value = "";
      showView("login-view");
    }, 2000);
  } else {
    msgEl.textContent = data.message || "Erreur lors de l'ouverture du compte.";
    msgEl.className = "form-msg error";
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem("minibank_token");
  localStorage.removeItem("minibank_user");
  currentUser = null;
  adminUser = null;
  cancelMFA();
  if ($("login-numero")) $("login-numero").value = "";
  if ($("login-pin")) $("login-pin").value = "";
  showView("login-view");
}

// ------------------------------------------------------------
// ESPACE CLIENT & SYNCHRONISATION
// ------------------------------------------------------------
function enterDashboard() {
  showView("dashboard-view");
  refreshUserInfo();
  loadHistorique();
  loadBeneficiaires();
}

function refreshUserInfo() {
  if (!currentUser) return;

  const initiale = (currentUser.titulaire || "C").charAt(0).toUpperCase();
  const firstName = (currentUser.titulaire || "").split(" ")[0] || "";
  const typeLabel = typeCompteLabel(currentUser.typeCompte);

  // Barre latérale
  $("user-name").textContent = currentUser.titulaire;
  $("user-avatar").textContent = initiale;
  $("account-num").textContent = "N° " + currentUser.numero;

  // En-tête
  $("welcome-name").textContent = "Bonjour, " + firstName;
  $("account-type-pill").textContent = typeLabel;

  // Solde et détails
  renderBalanceDisplay();
  if ($("balance-account-num")) $("balance-account-num").textContent = currentUser.numero;

  // Carte virtuelle
  if ($("card-holder-name")) $("card-holder-name").textContent = currentUser.titulaire;
  if ($("virtual-card-number")) {
    const numStr = String(currentUser.numero);
    const last4 = numStr.length >= 4 ? numStr.slice(-4) : numStr.padStart(4, '0');
    $("virtual-card-number").textContent = `•••• •••• •••• ${last4}`;
  }

  // Onglet Mes Comptes
  if ($("compte-details-titulaire")) $("compte-details-titulaire").textContent = currentUser.titulaire;
  if ($("compte-details-numero")) $("compte-details-numero").textContent = currentUser.numero;
  if ($("compte-details-type")) $("compte-details-type").textContent = typeLabel;

  // Profil
  if ($("profile-titulaire")) $("profile-titulaire").value = currentUser.titulaire || "";
  if ($("profile-type")) $("profile-type").value = currentUser.typeCompte || "Courant";

  // Section 2FA / MFA
  const mfaBadge = $("profile-mfa-badge");
  const dashMfaBadge = $("dash-mfa-badge");
  const mfaSetupSec = $("mfa-section-setup");
  const mfaConfirmSec = $("mfa-section-confirm");
  const mfaDisableSec = $("mfa-section-disable");

  if (currentUser.mfaEnabled) {
    if (mfaBadge) { mfaBadge.textContent = "Actif (Protégé)"; mfaBadge.className = "badge badge-in"; }
    if (dashMfaBadge) { dashMfaBadge.textContent = "Actif"; dashMfaBadge.className = "badge badge-in"; }
    if (mfaSetupSec) mfaSetupSec.style.display = "none";
    if (mfaConfirmSec) mfaConfirmSec.style.display = "none";
    if (mfaDisableSec) mfaDisableSec.style.display = "block";
  } else {
    if (mfaBadge) { mfaBadge.textContent = "Désactivé"; mfaBadge.className = "badge badge-neutral"; }
    if (dashMfaBadge) { dashMfaBadge.textContent = "Inactif"; dashMfaBadge.className = "badge badge-neutral"; }
    if (mfaSetupSec) mfaSetupSec.style.display = "block";
    if (mfaConfirmSec) mfaConfirmSec.style.display = "none";
    if (mfaDisableSec) mfaDisableSec.style.display = "none";
  }
}

// Anti-IDOR : Récupère les données depuis /api/comptes/me (garanti côté serveur par le token de session)
async function refreshAccount() {
  if (!authToken) return;
  const data = await apiCall("/api/comptes/me");
  if (data.success) {
    currentUser = data.compte;
    localStorage.setItem("minibank_user", JSON.stringify(currentUser));
    refreshUserInfo();
  }
}

// ------------------------------------------------------------
// VIREMENTS AVEC PRÉVISUALISATION & BÉNÉFICIAIRES
// ------------------------------------------------------------
async function loadBeneficiaires() {
  const data = await apiCall("/api/beneficiaires");
  const select = $("virement-benef-select");
  const listContainer = $("beneficiaries-list-container");
  const empty = $("beneficiaries-empty");

  if (!data.success || !data.beneficiaires) return;
  savedBeneficiaries = data.beneficiaires;

  // Dropdown
  if (select) {
    select.innerHTML = '<option value="">-- Choisir un bénéficiaire ou saisir manuellement --</option>';
    savedBeneficiaries.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.numeroCompte;
      opt.textContent = `${b.nom} (N° ${b.numeroCompte})`;
      select.appendChild(opt);
    });
  }

  // Liste de cartes
  if (listContainer) {
    listContainer.innerHTML = "";
    if (savedBeneficiaries.length === 0) {
      if (empty) empty.style.display = "block";
    } else {
      if (empty) empty.style.display = "none";
      savedBeneficiaries.forEach(b => {
        const initial = (b.nom || "B").charAt(0).toUpperCase();
        const card = document.createElement("div");
        card.className = "beneficiary-card";
        card.innerHTML = `
          <div class="beneficiary-info">
            <div class="beneficiary-avatar">${initial}</div>
            <div>
              <strong style="font-size:14px; color:var(--ink-900); display:block;">${escapeHtml(b.nom)}</strong>
              <span style="font-size:12px; color:var(--ink-500); font-family:var(--mono);">N° ${b.numeroCompte}</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary btn-small" onclick="quickTransferTo(${b.numeroCompte})">Virer</button>
            <button type="button" class="btn-icon" style="color:var(--neg);" onclick="deleteBeneficiary(${b.numeroCompte})" title="Supprimer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `;
        listContainer.appendChild(card);
      });
    }
  }
}

function onBeneficiarySelected() {
  const val = $("virement-benef-select").value;
  if (val) {
    $("virement-dest").value = val;
  }
}

function quickTransferTo(numero) {
  setTab("tab", "virements");
  $("virement-dest").value = numero;
  $("virement-montant").focus();
}

// Étape 1 : Aperçu sécurisé du virement
async function initiateTransferPreview() {
  const dest = parseInt($("virement-dest").value);
  const montant = parseFloat($("virement-montant").value);
  const motif = $("virement-motif").value.trim() || "Virement MiniBank";

  if (!dest || dest <= 0) {
    showNotification("virement-msg", "Numéro de compte destinataire invalide.", "error");
    return;
  }
  if (!montant || montant <= 0) {
    showNotification("virement-msg", "Montant de virement invalide.", "error");
    return;
  }
  if (dest === currentUser.numero) {
    showNotification("virement-msg", "Impossible d'effectuer un virement vers votre propre compte.", "error");
    return;
  }
  if (montant > currentUser.solde) {
    showNotification("virement-msg", `Solde insuffisant (${formatFCFA(currentUser.solde)} disponibles).`, "error");
    return;
  }

  // Appel de vérification côté serveur
  const data = await apiCall("/api/virement/preview", "POST", { dest, montant });
  if (!data.success) {
    showNotification("virement-msg", data.message || "Destinataire introuvable ou compte fermé.", "error");
    return;
  }

  pendingTransferData = {
    dest,
    montant,
    motif,
    destTitulaire: data.destTitulaire || "Client MiniBank",
    idempotencyKey: generateUUID()
  };

  // Affichage du modal d'aperçu
  $("prev-montant").textContent = formatFCFA(montant);
  $("prev-source").textContent = `N° ${currentUser.numero} (${currentUser.titulaire})`;
  $("prev-dest-name").textContent = pendingTransferData.destTitulaire;
  $("prev-dest-num").textContent = `N° ${dest}`;
  $("prev-motif").textContent = motif;

  $("transfer-preview-modal").classList.add("active");
}

function closeTransferPreviewModal() {
  $("transfer-preview-modal").classList.remove("active");
}

// Étape 2 : Exécution atomique ACID du virement
async function executeConfirmedTransfer() {
  if (!pendingTransferData) return;
  closeTransferPreviewModal();

  const data = await apiCall("/api/virement", "POST", {
    dest: pendingTransferData.dest,
    montant: pendingTransferData.montant,
    motif: pendingTransferData.motif,
    idempotencyKey: pendingTransferData.idempotencyKey
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("virement-dest").value = "";
    $("virement-montant").value = "";
    $("virement-motif").value = "";
    showNotification("virement-msg", data.message || "Virement exécuté avec succès.", "success");
    loadHistorique();

    // Proposer l'ouverture du reçu
    if (data.reference) {
      openReceipt(data.reference);
    }
  } else {
    showNotification("virement-msg", data.message || "Échec de l'exécution du virement.", "error");
  }
}

// Gestion des bénéficiaires
function openAddBeneficiaryModal() {
  $("add-benef-msg").className = "notification";
  $("new-benef-num").value = "";
  $("new-benef-nom").value = "";
  $("add-beneficiary-modal").classList.add("active");
}

function closeAddBeneficiaryModal() {
  $("add-beneficiary-modal").classList.remove("active");
}

async function submitAddBeneficiary() {
  const numeroCompte = parseInt($("new-benef-num").value);
  const nom = $("new-benef-nom").value.trim();

  if (!numeroCompte || !nom) {
    showNotification("add-benef-msg", "Veuillez remplir tous les champs.", "error");
    return;
  }

  const data = await apiCall("/api/beneficiaires", "POST", { numeroCompte, nom });
  if (data.success) {
    closeAddBeneficiaryModal();
    loadBeneficiaires();
    showNotification("virement-msg", "Bénéficiaire ajouté avec succès.", "success");
  } else {
    showNotification("add-benef-msg", data.message || "Erreur lors de l'enregistrement.", "error");
  }
}

async function deleteBeneficiary(numeroCompte) {
  if (!confirm(`Supprimer le bénéficiaire n° ${numeroCompte} ?`)) return;
  const data = await apiCall(`/api/beneficiaires/${numeroCompte}`, "DELETE");
  if (data.success) {
    loadBeneficiaires();
    showNotification("virement-msg", "Bénéficiaire supprimé.", "success");
  } else {
    showNotification("virement-msg", data.message || "Erreur lors de la suppression.", "error");
  }
}

// ------------------------------------------------------------
// SERVICES MOBILE MONEY
// ------------------------------------------------------------
function selectOperator(formType, operatorName, element) {
  const container = element.parentElement;
  container.querySelectorAll(".operator-choice").forEach(el => el.classList.remove("active"));
  element.classList.add("active");
  if (formType === "recharge") $("mm-recharge-op").value = operatorName;
  if (formType === "retrait") $("mm-retrait-op").value = operatorName;
}

async function doMobileMoneyRecharge() {
  const operateur = $("mm-recharge-op").value;
  const telephone = $("mm-recharge-tel").value.trim();
  const montant = parseFloat($("mm-recharge-montant").value);

  if (!telephone || telephone.length < 8) {
    showNotification("mm-global-msg", "Numéro de téléphone Mobile Money requis.", "error");
    return;
  }
  if (!montant || montant <= 0) {
    showNotification("mm-global-msg", "Montant de recharge invalide.", "error");
    return;
  }

  const data = await apiCall("/api/mobile-money/recharge", "POST", {
    operateur, telephone, montant, idempotencyKey: generateUUID()
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("mm-recharge-tel").value = "";
    $("mm-recharge-montant").value = "";
    showNotification("mm-global-msg", data.message || "Compte rechargé avec succès !", "success");
    loadHistorique();
    if (data.reference) openReceipt(data.reference);
  } else {
    showNotification("mm-global-msg", data.message || "Échec de la recharge Mobile Money.", "error");
  }
}

async function doMobileMoneyRetrait() {
  const operateur = $("mm-retrait-op").value;
  const telephone = $("mm-retrait-tel").value.trim();
  const montant = parseFloat($("mm-retrait-montant").value);

  if (!telephone || telephone.length < 8) {
    showNotification("mm-global-msg", "Numéro de téléphone Mobile Money requis.", "error");
    return;
  }
  if (!montant || montant <= 0) {
    showNotification("mm-global-msg", "Montant de retrait invalide.", "error");
    return;
  }

  const data = await apiCall("/api/mobile-money/retrait", "POST", {
    operateur, telephone, montant, idempotencyKey: generateUUID()
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("mm-retrait-tel").value = "";
    $("mm-retrait-montant").value = "";
    showNotification("mm-global-msg", data.message || "Fonds transférés vers Mobile Money avec succès !", "success");
    loadHistorique();
    if (data.reference) openReceipt(data.reference);
  } else {
    showNotification("mm-global-msg", data.message || "Solde insuffisant ou erreur de traitement.", "error");
  }
}

// ------------------------------------------------------------
// DÉPÔTS & RETRAITS GUICHET
// ------------------------------------------------------------
async function doDepot() {
  const montant = parseFloat($("depot-montant").value);
  if (!montant || montant <= 0) {
    showNotification("op-msg", "Montant invalide.", "error");
    return;
  }

  const data = await apiCall("/api/depot", "POST", { montant, idempotencyKey: generateUUID() });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("depot-montant").value = "";
    showNotification("op-msg", data.message || "Dépôt validé avec succès.", "success");
    loadHistorique();
    if (data.reference) openReceipt(data.reference);
  } else {
    showNotification("op-msg", data.message, "error");
  }
}

async function doRetrait() {
  const montant = parseFloat($("retrait-montant").value);
  if (!montant || montant <= 0) {
    showNotification("op-msg", "Montant invalide.", "error");
    return;
  }

  const data = await apiCall("/api/retrait", "POST", { montant, idempotencyKey: generateUUID() });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("retrait-montant").value = "";
    showNotification("op-msg", data.message || "Retrait effectué.", "success");
    loadHistorique();
    if (data.reference) openReceipt(data.reference);
  } else {
    showNotification("op-msg", data.message, "error");
  }
}

// ------------------------------------------------------------
// HISTORIQUE DES TRANSACTIONS & RECHERCHE
// ------------------------------------------------------------
async function loadHistorique() {
  if (!currentUser) return;

  const data = await apiCall("/api/historique/" + currentUser.numero);
  const tbody = document.querySelector("#history-table tbody");
  const recentTbody = document.querySelector("#dash-recent-table tbody");
  const empty = $("history-empty");
  const recentEmpty = $("dash-recent-empty");

  if (tbody) tbody.innerHTML = "";
  if (recentTbody) recentTbody.innerHTML = "";

  if (!data.success || !data.transactions || data.transactions.length === 0) {
    allTransactions = [];
    if (empty) empty.style.display = "block";
    if (recentEmpty) recentEmpty.style.display = "block";
    return;
  }

  allTransactions = data.transactions;
  if (empty) empty.style.display = "none";
  if (recentEmpty) recentEmpty.style.display = "none";

  renderHistoryTable(allTransactions);

  // Remplir les 5 dernières sur le dashboard
  if (recentTbody) {
    const recents = allTransactions.slice(0, 5);
    recents.forEach(t => {
      const meta = transactionMeta(t.type);
      let details = "—";
      if (t.compteDest > 0 && t.type === "Virement emis") details = "Vers n° " + t.compteDest;
      else if (t.compteDest > 0 && t.type === "Virement recu") details = "De n° " + t.compteDest;
      else if (t.operateur) details = `${t.operateur} (${t.detailsCible || ''})`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(t.date)}</td>
        <td><span class="badge ${meta.badge}">${meta.label}</span></td>
        <td style="font-family:var(--mono); font-size:12px;">${escapeHtml(t.reference || '—')}</td>
        <td>${escapeHtml(details)}</td>
        <td class="num ${meta.amount}">${meta.sign} ${formatFCFA(t.montant)}</td>
        <td class="num">
          <button type="button" class="btn btn-secondary btn-small" onclick="openReceipt('${escapeHtml(t.reference || t.id)}')">Reçu</button>
        </td>
      `;
      recentTbody.appendChild(tr);
    });
  }
}

function renderHistoryTable(transactions) {
  const tbody = document.querySelector("#history-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  transactions.forEach(t => {
    const meta = transactionMeta(t.type);
    let details = "—";
    if (t.compteDest > 0 && t.type === "Virement emis") details = "Vers le compte n° " + t.compteDest;
    else if (t.compteDest > 0 && t.type === "Virement recu") details = "Depuis le compte n° " + t.compteDest;
    else if (t.operateur) details = `${t.operateur} (${t.detailsCible || ''})`;
    if (t.motif) details += ` · ${t.motif}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.date)}</td>
      <td style="font-family:var(--mono); font-size:12px; font-weight:600;">${escapeHtml(t.reference || 'TXN-' + t.id)}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td>${escapeHtml(details)}</td>
      <td><span class="badge badge-in">Exécuté</span></td>
      <td class="num ${meta.amount}">${meta.sign} ${formatFCFA(t.montant)}</td>
      <td class="num">${formatFCFA(t.soldeApres)}</td>
      <td class="num">
        <button type="button" class="btn btn-secondary btn-small" onclick="openReceipt('${escapeHtml(t.reference || t.id)}')">
          Reçu PDF
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterHistoryTable() {
  const query = ($("history-search").value || "").toLowerCase().trim();
  if (!query) {
    renderHistoryTable(allTransactions);
    return;
  }
  const filtered = allTransactions.filter(t => {
    return (t.reference && t.reference.toLowerCase().includes(query)) ||
           (t.type && t.type.toLowerCase().includes(query)) ||
           (t.motif && t.motif.toLowerCase().includes(query)) ||
           (t.operateur && t.operateur.toLowerCase().includes(query)) ||
           (t.date && t.date.toLowerCase().includes(query));
  });
  renderHistoryTable(filtered);
}

// ------------------------------------------------------------
// REÇUS BANCAIRES OFFICIELS (MODAL & PDF PRINT)
// ------------------------------------------------------------
async function openReceipt(ref) {
  // Trouver dans les transactions locales ou interroger l'API
  let txn = allTransactions.find(t => t.reference === ref || String(t.id) === String(ref));
  if (!txn && ref) {
    const data = await apiCall(`/api/transactions/${ref}`);
    if (data.success && data.transaction) txn = data.transaction;
  }

  if (!txn) {
    txn = {
      reference: ref || "TXN-SIMULATED",
      date: new Date().toLocaleString("fr-FR"),
      type: "Opération Bancaire",
      montant: 0,
      compteSource: currentUser ? currentUser.numero : 0,
      compteDest: 0,
      motif: "Transaction certifiée"
    };
  }

  $("receipt-ref").textContent = txn.reference || ("TXN-" + txn.id);
  $("receipt-date").textContent = txn.date;
  $("receipt-amount").textContent = formatFCFA(txn.montant);
  $("receipt-type").textContent = txn.type;
  $("receipt-source").textContent = txn.compteSource > 0 ? `N° ${txn.compteSource}` : "Guichet Central";
  $("receipt-dest").textContent = txn.compteDest > 0 ? `N° ${txn.compteDest}` : (txn.detailsCible || "Non applicable");
  $("receipt-motif").textContent = txn.motif || txn.operateur || "Opération courante";

  $("receipt-modal").classList.add("active");
}

function closeReceiptModal() {
  $("receipt-modal").classList.remove("active");
}

function printReceipt() {
  window.print();
}

// ------------------------------------------------------------
// SÉCURITÉ : CHANGEMENT DE PIN & MFA
// ------------------------------------------------------------
async function changePin() {
  const ancienPin = $("pin-old").value;
  const nouveauPin = $("pin-new").value;

  if (!ancienPin || ancienPin.length !== 4 || !nouveauPin || nouveauPin.length !== 4) {
    showNotification("pin-change-msg", "Les codes PIN doivent comporter 4 chiffres.", "error");
    return;
  }

  const data = await apiCall("/api/compte/changer-pin", "POST", { ancienPin, nouveauPin });
  if (data.success) {
    $("pin-old").value = "";
    $("pin-new").value = "";
    showNotification("pin-change-msg", "Code PIN mis à jour avec succès !", "success");
  } else {
    showNotification("pin-change-msg", data.message || "Échec de modification du PIN.", "error");
  }
}

async function updateProfile() {
  const titulaire = $("profile-titulaire").value.trim();
  const typeCompte = $("profile-type").value;

  if (!titulaire) {
    showNotification("profile-msg", "Le nom complet est obligatoire.", "error");
    return;
  }

  const data = await apiCall(`/api/comptes/${currentUser.numero}/modifier`, "POST", {
    titulaire, typeCompte
  });

  if (data.success) {
    await refreshAccount();
    showNotification("profile-msg", "Profil mis à jour avec succès.", "success");
  } else {
    showNotification("profile-msg", data.message, "error");
  }
}

async function startMFASetup() {
  const data = await apiCall("/api/mfa/setup", "POST");
  if (data.success) {
    $("mfa-section-setup").style.display = "none";
    $("mfa-section-confirm").style.display = "block";
    $("mfa-setup-code-hint").textContent = `Code OTP simulé généré : ${data.code}`;
    $("mfa-confirm-code").value = data.code;
    $("mfa-confirm-code").focus();
  } else {
    showNotification("mfa-profile-msg", data.message, "error");
  }
}

async function confirmActivateMFA() {
  const code = $("mfa-confirm-code").value.trim();
  if (!code) {
    showNotification("mfa-profile-msg", "Veuillez entrer le code de validation.", "error");
    return;
  }

  const data = await apiCall("/api/mfa/activate", "POST", { code });
  if (data.success) {
    currentUser.mfaEnabled = true;
    refreshUserInfo();
    showNotification("mfa-profile-msg", "Authentification 2FA activée avec succès !", "success");
  } else {
    showNotification("mfa-profile-msg", data.message, "error");
  }
}

function cancelMFASetup() {
  $("mfa-section-setup").style.display = "block";
  $("mfa-section-confirm").style.display = "none";
  $("mfa-confirm-code").value = "";
}

async function disableMFA() {
  const pin = $("mfa-disable-pin").value;
  if (!pin || pin.length !== 4) {
    showNotification("mfa-profile-msg", "Veuillez confirmer votre PIN à 4 chiffres.", "error");
    return;
  }

  const data = await apiCall("/api/mfa/disable", "POST", { pin });
  if (data.success) {
    currentUser.mfaEnabled = false;
    $("mfa-disable-pin").value = "";
    refreshUserInfo();
    showNotification("mfa-profile-msg", "Protection 2FA désactivée.", "success");
  } else {
    showNotification("mfa-profile-msg", data.message, "error");
  }
}

async function closeAccount() {
  if (!confirm("Attention : Êtes-vous sûr de vouloir fermer définitivement votre compte bancaire ?")) return;
  if (Math.abs(currentUser.solde) > 0.1) {
    showNotification("profile-msg", `Votre solde doit être strictement égal à 0 FCFA pour clore le compte. Solde actuel : ${formatFCFA(currentUser.solde)}`, "error");
    return;
  }

  const data = await apiCall(`/api/comptes/${currentUser.numero}/fermer`, "POST");
  if (data.success) {
    alert("Compte fermé avec succès. À bientôt sur MiniBank.");
    logout();
  } else {
    showNotification("profile-msg", data.message, "error");
  }
}

// ------------------------------------------------------------
// CONSOLE D'ADMINISTRATION & AUDIT DE SÉCURITÉ
// ------------------------------------------------------------
function enterAdminDashboard() {
  showView("admin-view");
  $("admin-name").textContent = adminUser.titulaire;
  loadAdminStats();
  loadAdminComptes();
}

async function loadAdminStats() {
  const data = await apiCall("/api/admin/stats");
  if (!data.success) return;

  const s = data.stats;
  $("stat-total").textContent = s.nbComptesTotal;
  $("stat-actifs").textContent = s.nbComptesActifs;
  $("stat-masse").textContent = formatFCFA(s.masseTotale);
  $("stat-transactions").textContent = s.nbTransactions;
}

async function loadAdminComptes() {
  const data = await apiCall("/api/comptes");
  const tbody = document.querySelector("#admin-comptes-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data.success || !data.comptes) return;

  data.comptes.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--mono); font-weight:600;">${escapeHtml(c.numero)}</td>
      <td><strong>${escapeHtml(c.titulaire)}</strong></td>
      <td>${escapeHtml(typeCompteLabel(c.typeCompte))}</td>
      <td class="num">${formatFCFA(c.solde)}</td>
      <td>${c.actif ? '<span class="badge badge-in">Actif</span>' : '<span class="badge badge-neutral">Clôturé</span>'}</td>
      <td>${c.mfaEnabled ? '<span class="badge badge-in">2FA Activé</span>' : '<span class="badge badge-neutral">Standard</span>'}</td>
      <td class="num">
        <button type="button" class="btn btn-secondary btn-small" onclick="adminDeleteCompte(${Number(c.numero)})" style="color:var(--neg);">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadAdminTransactions() {
  const data = await apiCall("/api/admin/transactions");
  const tbody = document.querySelector("#admin-transactions-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data.success || !data.transactions || data.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ink-500);">Aucune transaction dans le registre central.</td></tr>';
    return;
  }

  data.transactions.forEach(t => {
    const meta = transactionMeta(t.type);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--mono); font-weight:600;">${escapeHtml(t.reference || 'TXN-' + t.id)}</td>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.compteSource > 0 ? escapeHtml(t.compteSource) : "Guichet"}</td>
      <td>${t.compteDest > 0 ? escapeHtml(t.compteDest) : (t.detailsCible || "—")}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td class="num ${meta.amount}">${meta.sign} ${formatFCFA(t.montant)}</td>
      <td class="num">${formatFCFA(t.soldeApres)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadAdminAuditLogs() {
  const data = await apiCall("/api/admin/audit-logs");
  const tbody = document.querySelector("#admin-audit-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data.success || !data.logs || data.logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--ink-500);">Aucun événement de sécurité journalisé.</td></tr>';
    return;
  }

  data.logs.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(l.date)}</td>
      <td><span class="audit-badge ${escapeHtml(l.niveau)}">${escapeHtml(l.niveau)}</span></td>
      <td><strong>${escapeHtml(l.action)}</strong></td>
      <td style="font-family:var(--mono);">${l.compteNumero > 0 ? escapeHtml(l.compteNumero) : "Global"}</td>
      <td style="font-family:var(--mono); font-size:12px;">${escapeHtml(l.ip)}</td>
      <td>${escapeHtml(l.details)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function adminCreateCompte() {
  const titulaire = $("admin-new-titulaire").value.trim();
  const pin = $("admin-new-pin").value;
  const typeCompte = $("admin-new-type").value;
  const soldeInitial = parseFloat($("admin-new-solde").value) || 0;
  const numeroForceStr = $("admin-new-numero").value;
  const numeroForce = numeroForceStr ? parseInt(numeroForceStr) : -1;
  const isAdmin = $("admin-new-isadmin").checked;

  if (!titulaire || !/^\d{4}$/.test(pin)) {
    showNotification("admin-create-msg", "Titulaire et PIN à 4 chiffres obligatoires.", "error");
    return;
  }

  const data = await apiCall("/api/comptes", "POST", {
    titulaire, pin, typeCompte, soldeInitial, numeroForce, isAdmin
  });

  if (data.success) {
    showNotification("admin-create-msg", `Compte créé avec succès ! Numéro : ${data.numero}`, "success");
    $("admin-new-titulaire").value = "";
    $("admin-new-pin").value = "";
    $("admin-new-numero").value = "";
    $("admin-new-solde").value = "0";
    $("admin-new-isadmin").checked = false;
    loadAdminStats();
    loadAdminComptes();
  } else {
    showNotification("admin-create-msg", data.message, "error");
  }
}

async function adminDeleteCompte(numero) {
  if (!confirm(`Confirmer la suppression définitive du compte client n° ${numero} ?`)) return;

  const data = await apiCall(`/api/admin/comptes/${numero}/supprimer`, "POST");
  if (data.success) {
    showNotification("admin-comptes-msg", "Compte supprimé de la base.", "success");
    loadAdminStats();
    loadAdminComptes();
  } else {
    showNotification("admin-comptes-msg", data.message, "error");
  }
}

// ------------------------------------------------------------
// INITIALISATION AU CHARGEMENT DU DOM
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Restauration de session active
  const savedUserStr = localStorage.getItem("minibank_user");
  if (authToken && savedUserStr) {
    try {
      const savedUser = JSON.parse(savedUserStr);
      if (savedUser.isAdmin) {
        adminUser = savedUser;
        enterAdminDashboard();
      } else {
        currentUser = savedUser;
        enterDashboard();
        refreshAccount();
      }
    } catch (e) {
      logout();
    }
  } else {
    showView("login-view");
  }

  // Onglets Espace Client
  document.querySelectorAll(".nav-item[data-tab]").forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.tab;
      setTab("tab", target);
    });
  });

  // Onglets Administration
  document.querySelectorAll(".nav-item[data-atab]").forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.atab;
      setTab("atab", target);
    });
  });
});
