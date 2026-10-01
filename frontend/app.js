// ============================================================
// MiniBank — Frontend
// ============================================================
const API = "";
let currentUser = null;
let adminUser = null;

// -
// HELPERS
// -
const $ = (id) => document.getElementById(id);

function formatEuro(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(n);
}

// Évite d'injecter du HTML saisi par un utilisateur dans les tableaux
function escapeHtml(value) {
  return String(value ?? " ").replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
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
    'Depot': { label: 'Dépôt', badge: 'badge-in', amount: 'positive', sign: '+' },
    'Depot initial': { label: 'Dépôt initial', badge: 'badge-in', amount: 'positive', sign: '+' },
    'Retrait': { label: 'Retrait', badge: 'badge-out', amount: 'negative', sign: '-' },
    'Virement emis': { label: 'Virement émis', badge: 'badge-out', amount: 'negative', sign: '-' },
    'Virement recu': { label: 'Virement reçu', badge: 'badge-in', amount: 'positive', sign: '+' }
  };
  return map[type] || { label: type, badge: 'badge-neutral', amount: '', sign: '' };
}

async function apiCall(url, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + url, opts);
    return await res.json();
  } catch (err) {
    console.error("apiCall error:", err);
    return { success: false, message: "Erreur réseau" };
  }
}

function showNotification(elId, msg, type = "info") {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `form-msg ${type}`;
  setTimeout(() => {
    el.textContent = "";
    el.className = "form-msg";
  }, 4000);
}

function setTab(prefix, tab) {
  document.querySelectorAll(`[data-${prefix}]`).forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.${prefix}-panel`).forEach(p => p.classList.remove("active"));
  const btn = document.querySelector(`[data-${prefix}="${tab}"]`);
  const panel = document.getElementById(`${prefix}-${tab}-panel`);
  if (btn) btn.classList.add("active");
  if (panel) panel.classList.add("active");
}

// -
// LOGIN
// -
async function doLogin() {
  const numero = parseInt($("login-numero").value);
  const pin = $("login-pin").value.trim();
  
  if (!numero || pin.length !== 4) {
    showNotification("login-error", "Numéro et PIN (4 chiffres) requis.", "error");
    return;
  }
  
  const data = await apiCall("/api/login", "POST", { numero, pin });
  
  if (data.success) {
    currentUser = data.compte;
    if (currentUser.isAdmin) {
      adminUser = currentUser;
      showView("admin-view");
      loadAdminStats();
      loadAdminComptes();
      loadAdminTransactions();
    } else {
      showView("dashboard-view");
      updateDashboard();
      loadHistory();
    }
  } else {
    showNotification("login-error", data.message || "Identifiants invalides.", "error");
  }
}

function doLogout() {
  currentUser = null;
  adminUser = null;
  showView("login-view");
  $("login-numero").value = "";
  $("login-pin").value = "";
}

// -
// DASHBOARD UTILISATEUR
// -
function updateDashboard() {
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
}

async function refreshAccount() {
  const data = await apiCall(`/api/comptes/${currentUser.numero}`);
  if (data.success) {
    currentUser = data.compte;
    updateDashboard();
  }
}

async function loadHistory() {
  const data = await apiCall(`/api/historique/${currentUser.numero}`);
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  
  if (!data.success || !data.transactions || data.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Aucune transaction pour le moment.</td></tr>';
    return;
  }
  
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

// -
// OPÉRATIONS
// -
async function doDepot() {
  const montant = parseFloat($("op-depot-montant").value);
  if (!montant || montant <= 0) {
    showNotification("op-depot-msg", "Montant invalide.", "error");
    return;
  }
  
  const data = await apiCall("/api/depot", "POST", {
    numero: currentUser.numero,
    montant
  });
  
  if (data.success) {
    currentUser.solde = data.solde;
    updateDashboard();
    loadHistory();
    $("op-depot-montant").value = "";
    showNotification("op-depot-msg", data.message, "success");
  } else {
    showNotification("op-depot-msg", data.message, "error");
  }
}

async function doRetrait() {
  const montant = parseFloat($("op-retrait-montant").value);
  if (!montant || montant <= 0) {
    showNotification("op-retrait-msg", "Montant invalide.", "error");
    return;
  }
  
  const data = await apiCall("/api/retrait", "POST", {
    numero: currentUser.numero,
    montant
  });
  
  if (data.success) {
    currentUser.solde = data.solde;
    updateDashboard();
    loadHistory();
    $("op-retrait-montant").value = "";
    showNotification("op-retrait-msg", data.message, "success");
  } else {
    showNotification("op-retrait-msg", data.message, "error");
  }
}

async function doVirement() {
  const dest = parseInt($("op-virement-dest").value);
  const montant = parseFloat($("op-virement-montant").value);
  
  if (!dest || dest <= 0) {
    showNotification("op-virement-msg", "Compte destinataire invalide.", "error");
    return;
  }
  if (!montant || montant <= 0) {
    showNotification("op-virement-msg", "Montant invalide.", "error");
    return;
  }
  
  const data = await apiCall("/api/virement", "POST", {
    source: currentUser.numero,
    dest,
    montant
  });
  
  if (data.success) {
    currentUser.solde = data.solde;
    updateDashboard();
    loadHistory();
    $("op-virement-dest").value = "";
    $("op-virement-montant").value = "";
    showNotification("op-virement-msg", data.message, "success");
  } else {
    showNotification("op-virement-msg", data.message, "error");
  }
}

// -
// PROFIL
// -
async function updateProfile() {
  const titulaire = $("profile-titulaire").value.trim();
  const typeCompte = $("profile-type").value;
  
  if (!titulaire) {
    showNotification("profile-msg", "Le nom est requis.", "error");
    return;
  }
  
  const data = await apiCall(`/api/comptes/${currentUser.numero}/modifier`, "POST", {
    titulaire,
    typeCompte
  });
  
  if (data.success) {
    await refreshAccount();
    showNotification("profile-msg", "Profil mis à jour.", "success");
  } else {
    showNotification("profile-msg", data.message, "error");
  }
}

// -
// ADMIN - STATISTIQUES
// -
async function loadAdminStats() {
  const data = await apiCall("/api/admin/stats");
  if (!data.success) return;
  
  $("admin-stats-comptes").textContent = data.stats.nbComptesTotal;
  $("admin-stats-actifs").textContent = data.stats.nbComptesActifs;
  $("admin-stats-masse").textContent = formatEuro(data.stats.masseTotale);
  $("admin-stats-transactions").textContent = data.stats.nbTransactions;
}

// -
// ADMIN - COMPTES
// -
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

// NOUVELLE FONCTION : Supprimer un compte (admin)
async function adminDeleteCompte(numero) {
  if (!confirm(`Voulez-vous vraiment supprimer le compte n° ${numero} ?\nCette action est irréversible.`)) {
    return;
  }
  
  const data = await apiCall(`/api/comptes/${numero}/supprimer`, "POST");
  
  if (data.success) {
    showNotification("admin-comptes-msg", `Compte n° ${numero} supprimé.`, "success");
    loadAdminStats();
    loadAdminComptes();
  } else {
    showNotification("admin-comptes-msg", data.message || "Erreur lors de la suppression.", "error");
  }
}

async function adminChangeNumero(ancienNumero) {
  const nouveauNumero = prompt(`Nouveau numéro pour le compte ${ancienNumero} :`);
  if (!nouveauNumero) return;
  
  const num = parseInt(nouveauNumero);
  if (!num || num <= 0) {
    showNotification("admin-comptes-msg", "Numéro invalide.", "error");
    return;
  }
  
  const data = await apiCall(`/api/comptes/${ancienNumero}/changer-numero`, "POST", {
    nouveauNumero: num
  });
  
  if (data.success) {
    showNotification("admin-comptes-msg", data.message, "success");
    loadAdminComptes();
  } else {
    showNotification("admin-comptes-msg", data.message, "error");
  }
}

// -
// ADMIN - TRANSACTIONS
// -
async function loadAdminTransactions() {
  const data = await apiCall("/api/admin/transactions");
  const tbody = document.querySelector("#admin-transactions-table tbody");
  tbody.innerHTML = "";
  
  if (!data.success || !data.transactions || data.transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Aucune transaction pour le moment.</td></tr>';
    return;
  }
  
  data.transactions.forEach(t => {
    const meta = transactionMeta(t.type);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.id}</td>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.compteSource > 0 ? t.compteSource : "—"}</td>
      <td>${t.compteDest > 0 ? t.compteDest : "—"}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td class="num ${meta.amount}">${meta.sign} ${formatEuro(t.montant)}</td>
      <td class="num">${formatEuro(t.soldeApres)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -
// ADMIN - CRÉER UN COMPTE
// -
async function adminCreateCompte() {
  const titulaire = $("admin-new-titulaire").value.trim();
  const pin = $("admin-new-pin").value.trim();
  const typeCompte = $("admin-new-type").value;
  const soldeInitial = parseFloat($("admin-new-solde").value) || 0;
  const numeroForce = parseInt($("admin-new-numero").value) || -1;
  const isAdmin = $("admin-new-isadmin").checked;
  
  if (!titulaire || pin.length !== 4) {
    showNotification("admin-create-msg", "Nom et PIN (4 chiffres) requis.", "error");
    return;
  }
  
  const data = await apiCall("/api/comptes", "POST", {
    titulaire,
    pin,
    typeCompte,
    soldeInitial,
    numeroForce,
    isAdmin
  });
  
  if (data.success) {
    showNotification("admin-create-msg", `Compte créé, n° ${data.numero}`, "success");
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

// -
// NAVIGATION
// -
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(id).classList.add("active");
  
  // Réinitialise les messages des formulaires
  ["login-error", "create-msg"].forEach(mid => {
    const el = $(mid);
    if (el) {
      el.textContent = "";
      el.className = "form-msg error";
    }
  });
  
  if (id === "dashboard-view") setTab("tab", "operations");
  if (id === "admin-view") setTab("atab", "comptes");
  window.scrollTo({ top: 0 });
}

// Active un onglet.
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) {
    e.preventDefault();
    setTab("tab", tabBtn.dataset.tab);
    return;
  }
  
  const atabBtn = e.target.closest("[data-atab]");
  if (atabBtn) {
    e.preventDefault();
    setTab("atab", atabBtn.dataset.atab);
    if (atabBtn.dataset.atab === "transactions") {
      loadAdminTransactions();
    } else if (atabBtn.dataset.atab === "comptes") {
      loadAdminComptes();
    } else if (atabBtn.dataset.atab === "stats") {
      loadAdminStats();
    }
  }
});