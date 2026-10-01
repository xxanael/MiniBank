// ============================================================
// MiniBank — Frontend (synchronisé avec index.html)
// ============================================================
const API = "";
let currentUser = null;
let adminUser = null;

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function formatEuro(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(n);
}

function escapeHtml(value) {
  return String(value ?? " ").replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function typeCompteLabel(type) {
  const labels = {
    'Courant': 'Compte Courant',
    'Épargne': "Compte d'Épargne",
    'Admin': 'Compte Administrateur'
  };
  return labels[type] || type;
}

function transactionMeta(type) {
  const map = {
    'Depot': { label: 'Dépôt', badge: 'badge-in', amount: 'amount-positive', sign: '+' },
    'Depot initial': { label: 'Dépôt initial', badge: 'badge-in', amount: 'amount-positive', sign: '+' },
    'Retrait': { label: 'Retrait', badge: 'badge-out', amount: 'amount-negative', sign: '-' },
    'Virement emis': { label: 'Virement émis', badge: 'badge-out', amount: 'amount-negative', sign: '-' },
    'Virement recu': { label: 'Virement reçu', badge: 'badge-in', amount: 'amount-positive', sign: '+' }
  };
  return map[type] || { label: type, badge: 'badge-neutral', amount: '', sign: '' };
}

async function apiCall(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    return await res.json();
  } catch (e) {
    console.error("API error:", e);
    return { success: false, message: "Erreur réseau" };
  }
}

// ------------------------------------------------------------
// NAVIGATION
// ------------------------------------------------------------
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo({ top: 0 });
}

// ------------------------------------------------------------
// AUTHENTIFICATION
// ------------------------------------------------------------
async function login() {
  const numero = parseInt($("login-numero").value);
  const pin = $("login-pin").value;
  const errEl = $("login-error");

  if (!numero || pin.length !== 4) {
    errEl.textContent = "Saisissez votre numéro de compte et votre PIN à 4 chiffres.";
    errEl.className = "form-msg error";
    return;
  }

  const data = await apiCall("/api/login", "POST", { numero, pin });

  if (data.success) {
    errEl.textContent = "";
    if (data.compte.isAdmin) {
      adminUser = data.compte;
      enterAdminDashboard();
    } else {
      currentUser = data.compte;
      enterDashboard();
    }
  } else {
    errEl.textContent = data.message || "Connexion échouée.";
    errEl.className = "form-msg error";
  }
}

async function createAccount() {
  const titulaire = $("create-titulaire").value.trim();
  const pin = $("create-pin").value;
  const typeCompte = $("create-type").value;
  const soldeInitial = parseFloat($("create-solde").value) || 0;
  const msgEl = $("create-msg");

  if (!titulaire) {
    msgEl.textContent = "Le nom du titulaire est requis.";
    msgEl.className = "form-msg error";
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    msgEl.textContent = "Le PIN doit contenir exactement 4 chiffres.";
    msgEl.className = "form-msg error";
    return;
  }
  if (soldeInitial < 0) {
    msgEl.textContent = "Le solde initial ne peut pas être négatif.";
    msgEl.className = "form-msg error";
    return;
  }

  const data = await apiCall("/api/comptes", "POST", {
    titulaire, pin, typeCompte, soldeInitial
  });

  if (data.success) {
    msgEl.textContent = `Compte créé. Votre numéro : ${data.numero}`;
    msgEl.className = "form-msg success";
    setTimeout(() => {
      $("login-numero").value = data.numero;
      $("login-pin").value = "";
      showView("login-view");
    }, 2000);
  } else {
    msgEl.textContent = data.message || "Erreur lors de la création.";
    msgEl.className = "form-msg error";
  }
}

function logout() {
  currentUser = null;
  adminUser = null;
  $("login-numero").value = "";
  $("login-pin").value = "";
  showView("login-view");
}

// ------------------------------------------------------------
// ESPACE CLIENT
// ------------------------------------------------------------
function enterDashboard() {
  showView("dashboard-view");
  refreshUserInfo();
  loadHistorique();
}

function refreshUserInfo() {
  if (!currentUser) return;

  const initiale = (currentUser.titulaire || "U").charAt(0).toUpperCase();
  const firstName = (currentUser.titulaire || "").split(" ")[0] || "";
  const typeLabel = typeCompteLabel(currentUser.typeCompte);

  // Barre latérale
  $("user-name").textContent = currentUser.titulaire;
  $("user-avatar").textContent = initiale;
  $("account-num").textContent = "Compte n° " + currentUser.numero;

  // En-tête
  $("welcome-name").textContent = "Bonjour, " + firstName;
  $("account-type-pill").textContent = typeLabel;

  // Résumé
  $("balance-amount").textContent = formatEuro(currentUser.solde);
  $("balance-card-num").textContent = "Compte n° " + currentUser.numero;
  $("balance-type").textContent = currentUser.typeCompte === "Épargne" ? "Compte épargne" : "Compte courant";
  $("account-num-2").textContent = currentUser.numero;
  $("account-type-2").textContent = typeLabel;

  // Profil
  $("profile-titulaire").value = currentUser.titulaire;
  $("profile-type").value = currentUser.typeCompte;
}

async function refreshAccount() {
  if (!currentUser) return;
  const data = await apiCall("/api/comptes/" + currentUser.numero);
  if (data.success) {
    currentUser = data.compte;
    refreshUserInfo();
  }
}

// ------------------------------------------------------------
// OPÉRATIONS BANCAIRES
// ------------------------------------------------------------
async function doDepot() {
  const montant = parseFloat($("depot-montant").value);
  if (!montant || montant <= 0) {
    showOpMsg("Montant invalide.", "error");
    return;
  }

  const data = await apiCall("/api/depot", "POST", {
    numero: currentUser.numero,
    montant
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("depot-montant").value = "";
    showOpMsg(data.message, "success");
    loadHistorique();
  } else {
    showOpMsg(data.message, "error");
  }
}

async function doRetrait() {
  const montant = parseFloat($("retrait-montant").value);
  if (!montant || montant <= 0) {
    showOpMsg("Montant invalide.", "error");
    return;
  }

  const data = await apiCall("/api/retrait", "POST", {
    numero: currentUser.numero,
    montant
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("retrait-montant").value = "";
    showOpMsg(data.message, "success");
    loadHistorique();
  } else {
    showOpMsg(data.message, "error");
  }
}

async function doVirement() {
  const dest = parseInt($("virement-dest").value);
  const montant = parseFloat($("virement-montant").value);

  if (!dest || dest <= 0) {
    showOpMsg("Compte destinataire invalide.", "error");
    return;
  }
  if (!montant || montant <= 0) {
    showOpMsg("Montant invalide.", "error");
    return;
  }
  if (dest === currentUser.numero) {
    showOpMsg("Impossible de virer vers le même compte.", "error");
    return;
  }

  const data = await apiCall("/api/virement", "POST", {
    source: currentUser.numero,
    dest,
    montant
  });

  if (data.success) {
    currentUser.solde = data.solde;
    refreshUserInfo();
    $("virement-dest").value = "";
    $("virement-montant").value = "";
    showOpMsg(data.message, "success");
    loadHistorique();
  } else {
    showOpMsg(data.message, "error");
  }
}

function showOpMsg(msg, type) {
  const el = $("op-msg");
  if (!el) return;
  el.textContent = msg;
  el.className = "form-msg " + type;
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-msg";
  }, 4000);
}

// ------------------------------------------------------------
// HISTORIQUE
// ------------------------------------------------------------
async function loadHistorique() {
  if (!currentUser) return;

  const data = await apiCall("/api/historique/" + currentUser.numero);
  const tbody = document.querySelector("#history-table tbody");
  const empty = $("history-empty");
  const wrapper = $("history-wrapper");

  tbody.innerHTML = "";

  if (!data.success || !data.transactions || data.transactions.length === 0) {
    if (empty) empty.style.display = "block";
    if (wrapper) wrapper.style.display = "none";
    return;
  }

  if (empty) empty.style.display = "none";
  if (wrapper) wrapper.style.display = "block";

  data.transactions.forEach(t => {
    const meta = transactionMeta(t.type);
    let details = "—";
    if (t.compteDest > 0 && t.type === "Virement emis") details = "Vers le compte n° " + t.compteDest;
    else if (t.compteDest > 0 && t.type === "Virement recu") details = "Depuis le compte n° " + t.compteDest;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.date)}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td>${details}</td>
      <td class="num ${meta.amount}">${meta.sign} ${formatEuro(t.montant)}</td>
      <td class="num">${formatEuro(t.soldeApres)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------------------------------------------
// PROFIL
// ------------------------------------------------------------
async function updateProfile() {
  const titulaire = $("profile-titulaire").value.trim();
  const typeCompte = $("profile-type").value;

  if (!titulaire) {
    showProfileMsg("Le nom est requis.", "error");
    return;
  }

  const data = await apiCall(`/api/comptes/${currentUser.numero}/modifier`, "POST", {
    titulaire, typeCompte
  });

  if (data.success) {
    await refreshAccount();
    showProfileMsg("Profil mis à jour.", "success");
  } else {
    showProfileMsg(data.message, "error");
  }
}

async function closeAccount() {
  if (!confirm("Êtes-vous sûr de vouloir fermer définitivement votre compte ?")) return;

  if (Math.abs(currentUser.solde) > 0.001) {
    showProfileMsg(
      "Le solde doit être à 0 € avant la fermeture. Solde actuel : " + formatEuro(currentUser.solde),
      "error"
    );
    return;
  }

  const data = await apiCall(`/api/comptes/${currentUser.numero}/fermer`, "POST");

  if (data.success) {
    alert("Compte fermé avec succès.");
    logout();
  } else {
    showProfileMsg(data.message, "error");
  }
}

function showProfileMsg(msg, type) {
  const el = $("profile-msg");
  if (!el) return;
  el.textContent = msg;
  el.className = "form-msg " + type;
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-msg";
  }, 4000);
}

// ------------------------------------------------------------
// ADMINISTRATION
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
  $("stat-masse").textContent = formatEuro(s.masseTotale);
  $("stat-transactions").textContent = s.nbTransactions;
}

async function loadAdminComptes() {
  const data = await apiCall("/api/comptes");
  const tbody = document.querySelector("#admin-comptes-table tbody");
  tbody.innerHTML = "";

  if (!data.success) return;

  data.comptes.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.numero)}</td>
      <td>${escapeHtml(c.titulaire)}</td>
      <td>${escapeHtml(typeCompteLabel(c.typeCompte))}</td>
      <td class="num">${formatEuro(c.solde)}</td>
      <td>${c.actif ? '<span class="badge badge-in">Actif</span>' : '<span class="badge badge-neutral">Fermé</span>'}</td>
      <td>${c.isAdmin ? '<span class="badge badge-accent">Admin</span>' : "—"}</td>
      <td class="actions">
        <button type="button" class="row-btn" onclick="adminChangeNumero(${Number(c.numero)})">Changer le n°</button>
        <button type="button" class="row-btn danger" onclick="adminDeleteCompte(${Number(c.numero)})">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadAdminTransactions() {
  const data = await apiCall("/api/admin/transactions");
  const tbody = document.querySelector("#admin-transactions-table tbody");
  tbody.innerHTML = "";

  if (!data.success || !data.transactions || data.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Aucune transaction pour le moment.</td></tr>';
    return;
  }

  data.transactions.forEach(t => {
    const meta = transactionMeta(t.type);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.id)}</td>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.compteSource > 0 ? escapeHtml(t.compteSource) : "—"}</td>
      <td>${t.compteDest > 0 ? escapeHtml(t.compteDest) : "—"}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td class="num ${meta.amount}">${meta.sign} ${formatEuro(t.montant)}</td>
      <td class="num">${formatEuro(t.soldeApres)}</td>
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
    showAdminCreateMsg("Le titulaire et un PIN à 4 chiffres sont requis.", "error");
    return;
  }

  const data = await apiCall("/api/comptes", "POST", {
    titulaire, pin, typeCompte, soldeInitial, numeroForce, isAdmin
  });

  if (data.success) {
    showAdminCreateMsg(`Compte créé, n° ${data.numero}`, "success");
    $("admin-new-titulaire").value = "";
    $("admin-new-pin").value = "";
    $("admin-new-numero").value = "";
    $("admin-new-solde").value = "0";
    $("admin-new-isadmin").checked = false;
    loadAdminStats();
    loadAdminComptes();
  } else {
    showAdminCreateMsg(data.message, "error");
  }
}

async function adminChangeNumero(ancienNumero) {
  const nouveau = prompt(`Nouveau numéro pour le compte ${ancienNumero} :`);
  if (!nouveau) return;

  const nouveauNumero = parseInt(nouveau);
  if (!nouveauNumero || nouveauNumero <= 0) {
    showAdminComptesMsg("Numéro invalide.", "error");
    return;
  }

  const data = await apiCall(`/api/admin/comptes/${ancienNumero}/changer-numero`, "POST", {
    nouveauNumero
  });

  if (data.success) {
    showAdminComptesMsg("Numéro modifié.", "success");
    loadAdminComptes();
  } else {
    showAdminComptesMsg(data.message, "error");
  }
}

async function adminDeleteCompte(numero) {
  if (!confirm(`Supprimer définitivement le compte n° ${numero} ?`)) return;

  const data = await apiCall(`/api/admin/comptes/${numero}/supprimer`, "POST");

  if (data.success) {
    showAdminComptesMsg("Compte supprimé.", "success");
    loadAdminStats();
    loadAdminComptes();
  } else {
    showAdminComptesMsg(data.message, "error");
  }
}

function showAdminCreateMsg(msg, type) {
  const el = $("admin-create-msg");
  if (!el) return;
  el.textContent = msg;
  el.className = "form-msg " + type;
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-msg";
  }, 4000);
}

function showAdminComptesMsg(msg, type) {
  const el = $("admin-comptes-msg");
  if (!el) return;
  el.textContent = msg;
  el.className = "form-msg " + type;
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-msg";
  }, 4000);
}

// ------------------------------------------------------------
// INITIALISATION
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Afficher la vue login par défaut
  showView("login-view");
});