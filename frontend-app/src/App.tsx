import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Smartphone,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Check,
  Send,
  Plus,
  Trash2,
  Printer,
  X,
  Lock,
  LogOut,
  Bell,
  Search,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Building,
  Activity,
} from "./icons";
import { OrangeMoneyLogo, MtnMoMoLogo, WaveLogo, MoovMoneyLogo } from "./operatorIcons";
import type {
  Compte,
  Transaction,
  Beneficiaire,
  AuditLog,
  AdminStats,
} from "./types";
import {
  request,
  getAuthToken,
  setAuthToken,
  getSavedUser,
  setSavedUser,
  formatFCFA,
  generateUUID,
} from "./api";

export default function App() {
  // Session & Utilisateur
  const [user, setUser] = useState<Compte | null>(getSavedUser());
  const [token, setTokenState] = useState<string | null>(getAuthToken());

  // Vue & Navigation (Tableau de bord, Comptes, Virements, Mobile Money, Historique, Sécurité, Admin)
  type TabType =
    | "overview"
    | "accounts"
    | "transfers"
    | "mobile_money"
    | "history"
    | "security"
    | "admin";
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Auth Form State
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loginNumero, setLoginNumero] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // 2FA Challenge State (TOTP Google Authenticator)
  const [mfaChallenge, setMfaChallenge] = useState<{
    required: boolean;
    tempToken: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // Register Form State
  const [regTitulaire, setRegTitulaire] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regType, setRegType] = useState("Courant");
  const [regSolde, setRegSolde] = useState("10000");

  // Masquage du Solde (Privacy Mode)
  const [isMasked, setIsMasked] = useState<boolean>(
    sessionStorage.getItem("minibank_masked") === "true"
  );
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Données Espace Client
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiaire[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [previewTransfer, setPreviewTransfer] = useState<{
    dest: number;
    destTitulaire: string;
    montant: number;
    motif: string;
    idempotencyKey: string;
  } | null>(null);

  const [receiptTxn, setReceiptTxn] = useState<Transaction | null>(null);
  const [isAddBenefModalOpen, setIsAddBenefModalOpen] = useState(false);
  const [newBenefNum, setNewBenefNum] = useState("");
  const [newBenefNom, setNewBenefNom] = useState("");

  // Formulaires Opérations
  const [transferDest, setTransferDest] = useState("");
  const [transferMontant, setTransferMontant] = useState("");
  const [transferMotif, setTransferMotif] = useState("");
  const [opFeedback, setOpFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Mobile Money
  const [mmOp, setMmOp] = useState<string>("Orange Money");
  const [mmTel, setMmTel] = useState("");
  const [mmMontant, setMmMontant] = useState("");
  const [mmMode, setMmMode] = useState<"recharge" | "retrait">("recharge");

  // Sécurité / TOTP Google Authenticator
  const [pinOld, setPinOld] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [mfaSetupData, setMfaSetupData] = useState<{
    secret: string;
    uri: string;
  } | null>(null);
  const [mfaConfirmInput, setMfaConfirmInput] = useState("");
  const [mfaDisablePin, setMfaDisablePin] = useState("");

  // Administration
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminAccounts, setAdminAccounts] = useState<Compte[]>([]);
  const [adminLogs, setAdminLogs] = useState<AuditLog[]>([]);
  const [isAdminAddCompteOpen, setIsAdminAddCompteOpen] = useState(false);
  const [adminNewTitulaire, setAdminNewTitulaire] = useState("");
  const [adminNewType, setAdminNewType] = useState("Courant");
  const [adminNewSolde, setAdminNewSolde] = useState("0");
  const [adminNewPin, setAdminNewPin] = useState("1234");

  // Écoute de déconnexion globale
  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setTokenState(null);
    };
    window.addEventListener("minibank_logout", handleLogout);
    return () => window.removeEventListener("minibank_logout", handleLogout);
  }, []);

  // Chargement des données au login
  useEffect(() => {
    if (token && user) {
      refreshAccount();
      loadTransactions();
      loadBeneficiaries();
      if (user.isAdmin) {
        loadAdminData();
      }
    }
  }, [token]);

  // Actualisation du compte (Anti-IDOR)
  const refreshAccount = async () => {
    try {
      const res = await request<{ success: boolean; compte: Compte }>(
        "/api/comptes/me"
      );
      if (res.success && res.compte) {
        setUser(res.compte);
        setSavedUser(res.compte);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTransactions = async () => {
    if (!user) return;
    try {
      const res = await request<{
        success: boolean;
        transactions: Transaction[];
      }>(`/api/historique/${user.numero}`);
      if (res.success) {
        setTransactions(res.transactions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadBeneficiaries = async () => {
    try {
      const res = await request<{
        success: boolean;
        beneficiaires: Beneficiaire[];
      }>("/api/beneficiaires");
      if (res.success) {
        setBeneficiaries(res.beneficiaires || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAdminData = async () => {
    try {
      const [sRes, aRes, lRes] = await Promise.all([
        request<{ success: boolean; stats: AdminStats }>("/api/admin/stats"),
        request<{ success: boolean; comptes: Compte[] }>("/api/comptes"),
        request<{ success: boolean; logs: AuditLog[] }>("/api/admin/audit-logs"),
      ]);
      if (sRes.success) setAdminStats(sRes.stats);
      if (aRes.success) setAdminAccounts(aRes.comptes);
      if (lRes.success) setAdminLogs(lRes.logs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCompteStatut = async (numero: number, actif: boolean) => {
    try {
      const res = await request<{ success: boolean; message: string }>(`/api/admin/comptes/${numero}/status`, "POST", { actif });
      if (res.success) {
        notify(res.message || (actif ? "Compte réactivé" : "Compte suspendu"), "success");
        loadAdminData();
      } else {
        notify(res.message || "Erreur de mise à jour", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur réseau", "error");
    }
  };

  const handleDeleteCompte = async (numero: number, titulaire: string) => {
    if (!window.confirm(`Confirmez-vous la suppression DÉFINITIVE du compte de ${titulaire} (N° ${numero}) ?`)) {
      return;
    }
    try {
      const res = await request<{ success: boolean; message: string }>(`/api/admin/comptes/${numero}/supprimer`, "POST");
      if (res.success) {
        notify("Compte supprimé définitivement du système", "success");
        loadAdminData();
      } else {
        notify(res.message || "Erreur lors de la suppression", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur réseau", "error");
    }
  };

  const handleAdminCreateCompte = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<{ success: boolean; numero?: number; message: string }>("/api/admin/comptes/creer", "POST", {
        titulaire: adminNewTitulaire,
        typeCompte: adminNewType,
        soldeInitial: parseInt(adminNewSolde, 10) || 0,
        pin: adminNewPin,
      });
      if (res.success) {
        notify(`Compte ouvert avec succès ! N° attribué : ${res.numero}`, "success");
        setIsAdminAddCompteOpen(false);
        setAdminNewTitulaire("");
        setAdminNewSolde("0");
        setAdminNewPin("1234");
        loadAdminData();
      } else {
        notify(res.message || "Erreur lors de l'ouverture du compte", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur réseau", "error");
    }
  };

  const handleCopyAccount = () => {
    if (!user) return;
    navigator.clipboard.writeText(String(user.numero));
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const toggleMask = () => {
    const next = !isMasked;
    setIsMasked(next);
    localStorage.setItem("minibank_masked", String(next));
  };

  const notify = (text: string, type: "success" | "error" = "success") => {
    setOpFeedback({ text, type });
    setTimeout(() => setOpFeedback(null), 5000);
  };

  // ------------------------------------------------------------
  // GESTION AUTHENTIFICATION
  // ------------------------------------------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await request<{
        success: boolean;
        token?: string;
        compte?: Compte;
        mfaRequired?: boolean;
        tempToken?: string;
        devOtp?: string;
        message?: string;
      }>("/api/login", "POST", {
        numero: parseInt(loginNumero),
        pin: loginPin,
      });

      if (res.success) {
        if (res.mfaRequired && res.tempToken) {
          setMfaChallenge({
            required: true,
            tempToken: res.tempToken,
          });
          return;
        }

        if (res.token && res.compte) {
          setAuthToken(res.token);
          setSavedUser(res.compte);
          setTokenState(res.token);
          setUser(res.compte);
          if (res.compte.isAdmin) {
            setActiveTab("admin");
          } else {
            setActiveTab("overview");
          }
        }
      } else {
        setAuthError(res.message || "Identifiants invalides.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Erreur de connexion.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await request<{
        success: boolean;
        token: string;
        compte: Compte;
        message?: string;
      }>("/api/login/mfa-verify", "POST", {
        tempToken: mfaChallenge.tempToken,
        code: mfaCode,
      });

      if (res.success) {
        setAuthToken(res.token);
        setSavedUser(res.compte);
        setTokenState(res.token);
        setUser(res.compte);
        setMfaChallenge(null);
        setActiveTab("overview");
      } else {
        setAuthError(res.message || "Code OTP invalide.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Code invalide.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await request<{
        success: boolean;
        numero: number;
        message?: string;
      }>("/api/comptes", "POST", {
        titulaire: regTitulaire,
        pin: regPin,
        typeCompte: regType,
        soldeInitial: parseFloat(regSolde) || 0,
      });

      if (res.success) {
        notify(`Compte ouvert avec succès ! N° ${res.numero}`, "success");
        setLoginNumero(String(res.numero));
        setLoginPin("");
        setAuthMode("login");
      } else {
        setAuthError(res.message || "Erreur lors de la création.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Erreur.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setSavedUser(null);
    setUser(null);
    setTokenState(null);
    setMfaChallenge(null);
    setAuthMode("login");
  };

  // ------------------------------------------------------------
  // OPÉRATIONS VIREMENTS
  // ------------------------------------------------------------
  const handleTransferPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    const dest = parseInt(transferDest);
    const montant = parseFloat(transferMontant);

    if (!dest || dest <= 0) {
      notify("Numéro de compte destinataire invalide.", "error");
      return;
    }
    if (!montant || montant <= 0) {
      notify("Montant invalide.", "error");
      return;
    }

    try {
      const res = await request<{
        success: boolean;
        destTitulaire?: string;
        message?: string;
      }>("/api/virement/preview", "POST", { dest, montant });

      if (res.success && res.destTitulaire) {
        setPreviewTransfer({
          dest,
          destTitulaire: res.destTitulaire,
          montant,
          motif: transferMotif || "Virement instantané",
          idempotencyKey: generateUUID(),
        });
      } else {
        notify(res.message || "Destinataire introuvable.", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur de validation.", "error");
    }
  };

  const handleExecuteTransfer = async () => {
    if (!previewTransfer) return;
    try {
      const res = await request<{
        success: boolean;
        reference?: string;
        solde: number;
        message?: string;
      }>("/api/virement", "POST", {
        dest: previewTransfer.dest,
        montant: previewTransfer.montant,
        motif: previewTransfer.motif,
        idempotencyKey: previewTransfer.idempotencyKey,
      });

      if (res.success) {
        setPreviewTransfer(null);
        setTransferDest("");
        setTransferMontant("");
        setTransferMotif("");
        notify("Virement exécuté avec succès !", "success");
        refreshAccount();
        loadTransactions();
        if (res.reference) {
          openReceiptModal(res.reference);
        }
      } else {
        notify(res.message || "Échec du virement.", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur de virement.", "error");
    }
  };

  // ------------------------------------------------------------
  // GESTION BÉNÉFICIAIRES
  // ------------------------------------------------------------
  const handleAddBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<{ success: boolean; message?: string }>(
        "/api/beneficiaires",
        "POST",
        {
          numeroCompte: parseInt(newBenefNum),
          nom: newBenefNom,
        }
      );
      if (res.success) {
        notify("Bénéficiaire ajouté avec succès !", "success");
        setIsAddBenefModalOpen(false);
        setNewBenefNum("");
        setNewBenefNom("");
        loadBeneficiaries();
      } else {
        notify(res.message || "Erreur d'ajout.", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur d'enregistrement.", "error");
    }
  };

  const handleDeleteBeneficiary = async (id: number) => {
    if (!confirm("Supprimer ce bénéficiaire ?")) return;
    try {
      const res = await request<{ success: boolean }>(
        `/api/beneficiaires/${id}`,
        "DELETE"
      );
      if (res.success) {
        notify("Bénéficiaire retiré.", "success");
        loadBeneficiaries();
      }
    } catch (err: any) {
      notify(err.message || "Erreur.", "error");
    }
  };

  // ------------------------------------------------------------
  // MOBILE MONEY
  // ------------------------------------------------------------
  const handleMobileMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    const montant = parseFloat(mmMontant);
    if (!mmTel || mmTel.length < 8) {
      notify("Numéro de téléphone invalide.", "error");
      return;
    }
    if (!montant || montant <= 0) {
      notify("Montant invalide.", "error");
      return;
    }

    const endpoint =
      mmMode === "recharge"
        ? "/api/mobile-money/recharge"
        : "/api/mobile-money/retrait";

    try {
      const res = await request<{
        success: boolean;
        reference?: string;
        message?: string;
      }>(endpoint, "POST", {
        operateur: mmOp,
        telephone: mmTel,
        montant,
        idempotencyKey: generateUUID(),
      });

      if (res.success) {
        notify(res.message || "Opération Mobile Money validée !", "success");
        setMmTel("");
        setMmMontant("");
        refreshAccount();
        loadTransactions();
        if (res.reference) openReceiptModal(res.reference);
      } else {
        notify(res.message || "Échec Mobile Money.", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur Mobile Money.", "error");
    }
  };

  // ------------------------------------------------------------
  // SÉCURITÉ & 2FA GOOGLE AUTHENTICATOR (TOTP RFC 6238)
  // ------------------------------------------------------------
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinNew.length !== 4) {
      notify("Le nouveau PIN doit comporter 4 chiffres.", "error");
      return;
    }
    try {
      const res = await request<{ success: boolean; message?: string }>(
        "/api/compte/changer-pin",
        "POST",
        {
          ancienPin: pinOld,
          nouveauPin: pinNew,
        }
      );
      if (res.success) {
        notify("Code PIN mis à jour avec succès !", "success");
        setPinOld("");
        setPinNew("");
      } else {
        notify(res.message || "Échec modification PIN.", "error");
      }
    } catch (err: any) {
      notify(err.message || "Erreur.", "error");
    }
  };

  const handleStartMfaSetup = async () => {
    try {
      const res = await request<{
        success: boolean;
        secret: string;
        uri: string;
        message?: string;
      }>("/api/mfa/setup", "POST");
      if (res.success && res.secret && res.uri) {
        setMfaSetupData({ secret: res.secret, uri: res.uri });
        setMfaConfirmInput("");
      } else {
        notify(res.message || "Erreur lors de l'initialisation TOTP.", "error");
      }
    } catch (e: any) {
      notify(e.message || "Erreur 2FA.", "error");
    }
  };

  const handleConfirmMfa = async () => {
    if (mfaConfirmInput.trim().length !== 6) {
      notify("Veuillez saisir le code à 6 chiffres affiché sur Google Authenticator.", "error");
      return;
    }
    try {
      const res = await request<{ success: boolean; message?: string }>(
        "/api/mfa/activate",
        "POST",
        { code: mfaConfirmInput.trim() }
      );
      if (res.success) {
        notify("Protection Google Authenticator (TOTP) activée avec succès !", "success");
        setMfaSetupData(null);
        setMfaConfirmInput("");
        refreshAccount();
      } else {
        notify(res.message || "Code Google Authenticator incorrect ou expiré.", "error");
      }
    } catch (e: any) {
      notify(e.message || "Code incorrect.", "error");
    }
  };

  const handleDisableMfa = async () => {
    if (mfaDisablePin.length !== 4) {
      notify("Veuillez saisir votre PIN à 4 chiffres.", "error");
      return;
    }
    try {
      const res = await request<{ success: boolean; message?: string }>(
        "/api/mfa/disable",
        "POST",
        { pin: mfaDisablePin }
      );
      if (res.success) {
        notify("Protection 2FA désactivée.", "success");
        setMfaDisablePin("");
        refreshAccount();
      }
    } catch (e: any) {
      notify(e.message || "Erreur PIN.", "error");
    }
  };

  // Reçu officiel
  const openReceiptModal = async (ref: string) => {
    const existing = transactions.find((t) => t.reference === ref);
    if (existing) {
      setReceiptTxn(existing);
      return;
    }
    try {
      const res = await request<{
        success: boolean;
        transaction: Transaction;
      }>(`/api/transactions/${ref}`);
      if (res.success && res.transaction) {
        setReceiptTxn(res.transaction);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtrage transactions
  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.reference && t.reference.toLowerCase().includes(q)) ||
      (t.type && t.type.toLowerCase().includes(q)) ||
      (t.motif && t.motif.toLowerCase().includes(q)) ||
      (t.operateur && t.operateur.toLowerCase().includes(q))
    );
  });

  // ============================================================
  // ÉCRAN 1 : AUTHENTIFICATION (SPLIT SCREEN BLACK & WHITE)
  // ============================================================
  if (!token || !user) {
    return (
      <div className="auth-page-wrapper">
        {/* Cercles de lueur ambient blur d'arrière-plan */}
        <div className="auth-ambient-blur-1" />
        <div className="auth-ambient-blur-2" />

        {/* Grande carte arrondie globale style Cartilyzer */}
        <div className="auth-card-container">
          {/* Panneau Gauche : Gradient riche Prussian Blue & SalesPort Blue + Effet Blur & Icônes */}
          <div className="auth-left-panel">
            <div>
              {/* Nouveau Logo MiniBank */}
              <div className="auth-logo-header">
                <img src="/img/logo.png" alt="MiniBank" className="auth-logo-img" />
              </div>

              {/* Titre & Sous-titre */}
              <h2 className="auth-headline-title">
                WELCOME.
              </h2>
              <p className="auth-headline-sub">
                Gérez vos finances, réalisez vos virements et pilotez vos comptes en toute sérénité.
              </p>

              {/* 3 Cartes de fonctionnalités avec icônes et effet blur/glass (Style Cartilyzer) */}
              <div className="auth-features-list">
                <div className="auth-feature-card">
                  <div className="auth-feature-icon-box">
                    <CreditCard size={22} color="#185DF1" />
                  </div>
                  <div className="auth-feature-text">
                    <div className="auth-feature-title">Gérez vos comptes & cartes</div>
                    <div className="auth-feature-desc">
                      Solde en temps réel, transactions instantanées et plafonds sécurisés.
                    </div>
                  </div>
                </div>

                <div className="auth-feature-card">
                  <div className="auth-feature-icon-box">
                    <Smartphone size={22} color="#185DF1" />
                  </div>
                  <div className="auth-feature-text">
                    <div className="auth-feature-title">Paiements & Mobile Money</div>
                    <div className="auth-feature-desc">
                      Recharges et retraits immédiats Orange Money, Wave et MTN MoMo.
                    </div>
                  </div>
                </div>

                <div className="auth-feature-card">
                  <div className="auth-feature-icon-box">
                    <Shield size={22} color="#185DF1" />
                  </div>
                  <div className="auth-feature-text">
                    <div className="auth-feature-title">Sécurité TOTP Google Authenticator</div>
                    <div className="auth-feature-desc">
                      Chiffrement PBKDF2 et protection anti-IDOR temps réel à chaque requête.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pied de page du panneau gauche */}
            <div className="auth-left-footer">
              <span>Plateforme Bancaire Certifiée</span>
              <span>Architecture ACID & Zéro IDOR</span>
            </div>
          </div>

          {/* Panneau Droit : Formulaire épuré blanc & SalesPort Blue */}
          <div className="auth-right-panel">
            <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
              {/* Toggle Connexion / Inscription */}
              <div style={{ display: "flex", background: "var(--alice-blue)", padding: 6, borderRadius: 9999, marginBottom: 28, border: "1px solid var(--alice-blue-border)" }}>
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setAuthError(""); setMfaChallenge(null); }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 9999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                    background: authMode === "login" ? "#031130" : "transparent",
                    color: authMode === "login" ? "#FFFFFF" : "#6E7381",
                    boxShadow: authMode === "login" ? "0 4px 12px rgba(3, 17, 48, 0.2)" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("register"); setAuthError(""); setMfaChallenge(null); }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 9999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                    background: authMode === "register" ? "#031130" : "transparent",
                    color: authMode === "register" ? "#FFFFFF" : "#6E7381",
                    boxShadow: authMode === "register" ? "0 4px 12px rgba(3, 17, 48, 0.2)" : "none",
                    transition: "all 0.2s"
                  }}
                >
                  Ouvrir un compte
                </button>
              </div>

              {authError && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "12px 16px", borderRadius: 14, fontSize: 13, fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle size={16} /> {authError}
                </div>
              )}

              {/* Validation 2FA Google Authenticator */}
              {mfaChallenge ? (
                <form onSubmit={handleVerifyMFA}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(24, 93, 241, 0.1)", color: "#185DF1", padding: "4px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                    <Shield size={14} /> Google Authenticator TOTP
                  </div>
                  <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: "#031130" }}>Authentification 2FA</h3>
                  <p style={{ color: "#6E7381", fontSize: 14, marginBottom: 24 }}>
                    Votre compte est protégé. Saisissez le code temporaire à 6 chiffres affiché sur votre application <strong>Google Authenticator</strong>.
                  </p>

                  <div className="field-group">
                    <label className="field-label">Code Google Authenticator (6 chiffres)</label>
                    <input
                      type="text"
                      maxLength={6}
                      className="field-input"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      style={{ textAlign: "center", letterSpacing: 6, fontSize: 24, fontFamily: "var(--mono)" }}
                      autoFocus
                      required
                    />
                  </div>

                  <button type="submit" className="btn-electric-submit" disabled={authLoading || mfaCode.length !== 6}>
                    {authLoading ? "Validation..." : "Valider le code TOTP"}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMfaChallenge(null); setMfaCode(""); }}
                    style={{ width: "100%", marginTop: 12, padding: 12, background: "transparent", border: "none", color: "#6E7381", cursor: "pointer", fontWeight: 600 }}
                  >
                    Retour
                  </button>
                </form>
              ) : authMode === "login" ? (
                /* Formulaire Connexion */
                <form onSubmit={handleLogin}>
                  <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, color: "#031130", letterSpacing: -0.5 }}>
                    Welcome
                  </h3>
                  <p style={{ color: "#6E7381", fontSize: 14, marginBottom: 24 }}>
                    Entrez votre identifiant bancaire et votre code PIN.
                  </p>

                  <div className="field-group">
                    <label className="field-label">Numéro de compte (Identifiant bancaire)</label>
                    <input
                      type="number"
                      className="field-input"
                      value={loginNumero}
                      onChange={(e) => setLoginNumero(e.target.value)}
                      placeholder="Ex : 514878950"
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Code PIN confidentiel (4 chiffres)</label>
                    <input
                      type="password"
                      maxLength={4}
                      className="field-input"
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      placeholder="••••"
                      required
                    />
                  </div>

                  <button type="submit" className="btn-electric-submit" disabled={authLoading}>
                    {authLoading ? "Connexion sécurisée..." : "Se connecter"} <ArrowUpRight size={16} />
                  </button>
                </form>
              ) : (
                /* Formulaire Création de Compte */
                <form onSubmit={handleRegister}>
                  <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, color: "#031130", letterSpacing: -0.5 }}>
                    Ouvrir un compte
                  </h3>
                  <p style={{ color: "#6E7381", fontSize: 14, marginBottom: 24 }}>
                    Création instantanée sans paperasse.
                  </p>

                  <div className="field-group">
                    <label className="field-label">Nom complet du titulaire</label>
                    <input
                      type="text"
                      className="field-input"
                      value={regTitulaire}
                      onChange={(e) => setRegTitulaire(e.target.value)}
                      placeholder="Ex : Anaël Kouassi"
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div className="field-group">
                      <label className="field-label">Code PIN (4 chiffres)</label>
                      <input
                        type="password"
                        maxLength={4}
                        className="field-input"
                        value={regPin}
                        onChange={(e) => setRegPin(e.target.value)}
                        placeholder="••••"
                        required
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Type de compte</label>
                      <select
                        className="field-select"
                        value={regType}
                        onChange={(e) => setRegType(e.target.value)}
                      >
                        <option value="Courant">Courant</option>
                        <option value="Epargne">Épargne</option>
                      </select>
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Dépôt initial (FCFA)</label>
                    <input
                      type="number"
                      className="field-input"
                      value={regSolde}
                      onChange={(e) => setRegSolde(e.target.value)}
                      min={0}
                      step={100}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-electric-submit" disabled={authLoading}>
                    {authLoading ? "Création en cours..." : "Créer mon compte"} <ArrowUpRight size={16} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ÉCRAN 2 : APPLICATION CONNECTÉE AVEC MENU DE CÔTÉ (SIDEBAR)
  // ============================================================
  return (
    <div className="app-shell">
      {/* Toast Notification */}
      {opFeedback && (
        <div
          style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            background: opFeedback.type === "success" ? "#0F172A" : "#EF4444",
            color: opFeedback.type === "success" ? "#EEEBDA" : "#FFFFFF",
            border: opFeedback.type === "success" ? "1px solid #4F46E5" : "none",
            borderRadius: 16, padding: "14px 22px", fontSize: 14, fontWeight: 700,
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 10,
          }}
        >
          {opFeedback.type === "success" ? <CheckCircle2 size={18} color="#EEEBDA" /> : <AlertTriangle size={18} />}
          {opFeedback.text}
        </div>
      )}

      {/* ============================================================
          SIDEBAR GAUCHE (MENU DE CÔTÉ ÉLÉGANT)
          Inspiré directement du design officiel MiniBank
          ============================================================ */}
      <aside className="app-sidebar">
        {/* Logo Unique Épuré & Simple */}
        <div className="sidebar-brand-clean">
          <img src="/img/logo.png" alt="MiniBank" className="sidebar-clean-logo" />
        </div>

        {/* Navigation Categories : Restriction stricte des rôles */}
        <nav className="sidebar-nav">
          {user.isAdmin ? (
            /* L'ADMIN N'A ACCÈS QU'AU TABLEAU DE BORD GÉNÉRAL ET À LA SUPERVISION */
            <>
              <div className="nav-group-label">ADMINISTRATION</div>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                <span className="link-icon"><Building size={18} /></span>
                <span className="link-text">Tableau de bord</span>
              </button>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "admin" ? "active" : ""}`}
                onClick={() => { setActiveTab("admin"); loadAdminData(); }}
              >
                <span className="link-icon"><Shield size={18} /></span>
                <span className="link-text">Supervision & Audit</span>
              </button>
            </>
          ) : (
            /* LES CLIENTS ONT ACCÈS AUX SERVICES BANCAIRES */
            <>
              <div className="nav-group-label">GÉNÉRAL</div>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                <span className="link-icon"><Building size={18} /></span>
                <span className="link-text">Tableau de bord</span>
              </button>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "accounts" ? "active" : ""}`}
                onClick={() => setActiveTab("accounts")}
              >
                <span className="link-icon"><CreditCard size={18} /></span>
                <span className="link-text">Mes Comptes & Cartes</span>
              </button>

              <div className="nav-group-label">PAIEMENTS & TRANSFERTS</div>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "transfers" ? "active" : ""}`}
                onClick={() => setActiveTab("transfers")}
              >
                <span className="link-icon"><Send size={18} /></span>
                <span className="link-text">Virements & Bénéficiaires</span>
              </button>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "mobile_money" ? "active" : ""}`}
                onClick={() => setActiveTab("mobile_money")}
              >
                <span className="link-icon"><Smartphone size={18} /></span>
                <span className="link-text">Mobile Money</span>
              </button>

              <div className="nav-group-label">SUIVI & SÉCURITÉ</div>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "history" ? "active" : ""}`}
                onClick={() => { setActiveTab("history"); loadTransactions(); }}
              >
                <span className="link-icon"><Activity size={18} /></span>
                <span className="link-text">Historique & Reçus</span>
              </button>
              <button
                type="button"
                className={`sidebar-link ${activeTab === "security" ? "active" : ""}`}
                onClick={() => setActiveTab("security")}
              >
                <span className="link-icon"><Lock size={18} /></span>
                <span className="link-text">Sécurité & Paramètres</span>
              </button>
            </>
          )}
        </nav>

        {/* Profil Utilisateur & Déconnexion au bas de la Sidebar */}
        <div className="sidebar-footer">
          <div className="user-profile-widget">
            <div className="sidebar-avatar">
              {user.titulaire.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.titulaire}</div>
              <div className="sidebar-account-badge">Compte N° {user.numero}</div>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              title="Se déconnecter de la session sécurisée"
              onClick={handleLogout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================
          ZONE PRINCIPALE À DROITE (BIEN DISPOSÉE)
          ============================================================ */}
      <main className="app-main-viewport">
        {/* Top Header Bar */}
        <header className="viewport-header">
          <div className="viewport-title-area">
            <h1 className="viewport-page-title">
              {activeTab === "overview" && "Tableau de bord"}
              {activeTab === "accounts" && "Mes Comptes & Cartes"}
              {activeTab === "transfers" && "Virements & Bénéficiaires"}
              {activeTab === "mobile_money" && "Paiements Mobile Money"}
              {activeTab === "history" && "Historique des Opérations & Reçus"}
              {activeTab === "security" && "Sécurité & Paramètres d'Accès"}
              {activeTab === "admin" && "Supervision Système & Audit"}
            </h1>
            <p className="viewport-subtitle">
              Bonjour, <strong style={{ color: "#0A0A0A" }}>{user.titulaire}</strong> · Espace bancaire certifié
            </p>
          </div>

          <div className="viewport-actions">
            {/* Badge Anti-IDOR */}
            <div className="security-live-badge">
              <span className="live-pulse-dot" />
              <span>Anti-IDOR Actif</span>
            </div>

            {/* Bouton Masquer/Afficher Solde */}
            <button
              type="button"
              className="header-pill-btn"
              onClick={toggleMask}
              title="Masquer ou afficher le solde"
            >
              {isMasked ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>{isMasked ? "Afficher le solde" : "Masquer"}</span>
            </button>

            {/* Notifications */}
            <button
              type="button"
              className="header-icon-circle"
              onClick={() => notify("Système sécurisé : Aucune anomalie détectée.", "success")}
              title="Notifications"
            >
              <Bell size={18} />
              <span className="bell-badge" />
            </button>
          </div>
        </header>

        {/* Contenu Défilant et Bien Disposé */}
        <div className="viewport-content-container">

        {/* ============================================================
            VUE 1 : TABLEAU DE BORD (ADMIN VS CLIENT)
            ============================================================ */}
        {activeTab === "overview" && user.isAdmin ? (
          <div>
            {/* Top Grid Admin : Masse Monétaire Globale & Infrastructure */}
            <div className="hero-two-columns">
              <div className="balance-hero-card" style={{ background: "linear-gradient(135deg, #0B0F19 0%, #1E1B4B 100%)", color: "#FFFFFF", borderColor: "#312E81" }}>
                <div>
                  <div className="balance-top-row">
                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#EEEBDA", textTransform: "uppercase" }}>
                      Trésorerie Globale MiniBank
                    </span>
                    <span style={{ background: "rgba(238, 235, 218, 0.15)", color: "#EEEBDA", padding: "4px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
                      Système Actif
                    </span>
                  </div>

                  <div className="balance-title-label" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                    Masse monétaire totale sous gestion
                  </div>

                  <div className="balance-main-val" style={{ color: "#FFFFFF" }}>
                    {formatFCFA(adminStats?.masseTotale || 0)}
                  </div>
                </div>

                <div className="balance-actions-row">
                  <button type="button" className="btn-black-pill" style={{ background: "#EEEBDA", color: "#0B0F19" }} onClick={() => { setActiveTab("admin"); loadAdminData(); }}>
                    <Shield size={15} color="#4F46E5" /> Supervision & Gestion des Comptes
                  </button>
                  <button type="button" className="btn-white-pill" style={{ background: "rgba(255,255,255,0.1)", color: "#FFFFFF", border: "1px solid rgba(255,255,255,0.2)" }} onClick={loadAdminData}>
                    <Activity size={15} /> Actualiser les Métriques
                  </button>
                </div>
              </div>

              {/* Carte Métriques Clés Système */}
              <div className="electric-hero-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="priority-pill">
                    <Building size={12} /> INFRASTRUCTURE BANCAIRE
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(238,235,218,0.15)", color: "#EEEBDA", padding: "4px 10px", borderRadius: 9999 }}>
                    SUPERVISION GLOBALE
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-secondary)" }}>Volume Global Traité</span>
                  <div className="electric-card-val">{adminStats?.nbTransactions || 0} Transactions</div>

                  <div className="electric-progress-bar">
                    <div className="electric-progress-fill" style={{ width: "100%" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-tertiary)" }}>
                    {adminStats?.nbComptesActifs || 0} comptes actifs sur {adminStats?.nbComptesTotal || 0} comptes enregistrés
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 800 }}>
                  <span>Vérification Anti-IDOR : 100% Validée</span>
                  <span>Verrous ACID & TOTP : Prêts</span>
                </div>
              </div>
            </div>

            {/* Statistiques Globales & Répartition Système */}
            <div className="bottom-three-columns" style={{ marginTop: 24 }}>
              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><Building size={18} color="#4F46E5" /> Comptes Bancaires</h3>
                  <span className="sub-pill-badge">Global</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, margin: "14px 0" }}>
                  {adminStats?.nbComptesTotal || 0}
                </div>
                <p style={{ color: "var(--ink-tertiary)", fontSize: 13 }}>
                  Dont {adminStats?.nbComptesActifs || 0} comptes en cours d'utilisation active et vérifiés.
                </p>
              </div>

              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><Activity size={18} color="#4F46E5" /> Flux Monétaires</h3>
                  <span className="sub-pill-badge">Audit</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, margin: "14px 0" }}>
                  {formatFCFA(adminStats?.masseTotale || 0)}
                </div>
                <p style={{ color: "var(--ink-tertiary)", fontSize: 13 }}>
                  Liquidités totales garanties par les verrous de concurrence PostgreSQL / ACID.
                </p>
              </div>

              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><Shield size={18} color="#4F46E5" /> Journal d'Audit</h3>
                  <span className="sub-pill-badge">Temps Réel</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, margin: "14px 0" }}>
                  {adminLogs.length} Événements
                </div>
                <p style={{ color: "var(--ink-tertiary)", fontSize: 13 }}>
                  Traçabilité continue des connexions, virements et actions administratives.
                </p>
              </div>
            </div>
          </div>
        ) : activeTab === "overview" ? (
          <div>
            {/* Top Grid Client */}
            <div className="hero-two-columns">
              <div className="balance-hero-card">
                <div>
                  <div className="balance-top-row">
                    <div className="currency-tags-list">
                      <span className="currency-tag active">XOF (FCFA)</span>
                      <span className="currency-tag">EUR</span>
                      <span className="currency-tag">USD</span>
                    </div>

                    <button type="button" className="account-num-pill" onClick={handleCopyAccount}>
                      <span>N° {user.numero}</span>
                      {copiedAccount ? <Check size={14} color="#4F46E5" /> : <Copy size={14} />}
                    </button>
                  </div>

                  <div className="balance-title-label">
                    Solde total disponible
                    <button
                      type="button"
                      onClick={toggleMask}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-secondary)", display: "flex", alignItems: "center" }}
                      title="Masquer/Afficher le solde"
                    >
                      {isMasked ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <div className="balance-main-val">
                    {isMasked ? "•••••••• FCFA" : formatFCFA(user.solde)}
                  </div>
                </div>

                <div className="balance-actions-row">
                  <button type="button" className="btn-black-pill" onClick={() => setActiveTab("transfers")}>
                    <Send size={15} color="#EEEBDA" /> Virement Instantané
                  </button>
                  <button type="button" className="btn-white-pill" onClick={() => setActiveTab("mobile_money")}>
                    <Smartphone size={15} /> Mobile Money
                  </button>
                  <button
                    type="button"
                    className="circle-arrow-btn"
                    onClick={() => setActiveTab("transfers")}
                    title="Effectuer un transfert"
                  >
                    <ArrowUpRight size={20} />
                  </button>
                </div>
              </div>

              {/* Carte FinTech Midnight Indigo & #EEEBDA */}
              <div className="electric-hero-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="priority-pill">
                    <Shield size={12} /> PROTECTION FINTECH
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(238,235,218,0.15)", color: "#EEEBDA", padding: "4px 10px", borderRadius: 9999 }}>
                    {user.mfaEnabled ? "2FA ACTIF" : "2FA DISPONIBLE"}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-secondary)" }}>Plafond journalier de virement</span>
                  <div className="electric-card-val">1 000 000 FCFA</div>

                  <div className="electric-progress-bar">
                    <div className="electric-progress-fill" style={{ width: "25%" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-tertiary)" }}>
                    250 000 FCFA utilisés aujourd'hui (Plafond réinitialisé à minuit)
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.12)", fontSize: 12, fontWeight: 800 }}>
                  <span>Vérification Anti-IDOR : 100% Validée</span>
                  <span>Verrous ACID & TOTP : Prêts</span>
                </div>
              </div>
            </div>

            {/* Bottom 3 Columns Grid : Spending / Earning / Recent Transactions */}
            <div className="bottom-three-columns">
              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><Activity size={18} color="#4F46E5" /> Répartition des Flux</h3>
                  <span className="sub-pill-badge">Ce mois</span>
                </div>

                <div className="spending-center-circle">
                  <div className="spending-inner-circle">
                    <span style={{ fontSize: 11, color: "var(--ink-tertiary)" }}>Flux Total</span>
                    <strong>100%</strong>
                  </div>
                </div>

                <div className="spending-items-list">
                  <div className="spending-item-row">
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#0A0A0A", marginRight: 6 }} /> Virements émis</span>
                    <strong>45%</strong>
                  </div>
                  <div className="spending-item-row">
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4F46E5", marginRight: 6 }} /> Mobile Money</span>
                    <strong>35%</strong>
                  </div>
                  <div className="spending-item-row">
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#8A8F9B", marginRight: 6 }} /> Autres paiements</span>
                    <strong>20%</strong>
                  </div>
                </div>
              </div>

              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><Building size={18} color="#4F46E5" /> Sources d'Approvisionnement</h3>
                  <span className="sub-pill-badge">Actif</span>
                </div>

                <div style={{ fontSize: 28, fontWeight: 800, margin: "10px 0 20px" }}>
                  {formatFCFA(user.solde)}
                </div>

                <div className="earning-item">
                  <div className="earning-label-row">
                    <span>Orange Money & Wave</span>
                    <strong>65%</strong>
                  </div>
                  <div className="earning-bar-track">
                    <div className="earning-bar-fill" style={{ width: "65%", background: "var(--midnight-indigo-electric)" }} />
                  </div>
                </div>

                <div className="earning-item">
                  <div className="earning-label-row">
                    <span>Virements Reçus</span>
                    <strong>35%</strong>
                  </div>
                  <div className="earning-bar-track">
                    <div className="earning-bar-fill" style={{ width: "35%", background: "#0A0A0A" }} />
                  </div>
                </div>
              </div>

              <div className="metric-panel-card">
                <div className="metric-header">
                  <h3><CreditCard size={18} color="#4F46E5" /> Dernières Opérations</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    style={{ background: "transparent", border: "none", color: "var(--midnight-indigo-electric)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Voir tout
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {transactions.slice(0, 4).map((t) => {
                    const isPositive = t.type.includes("recu") || t.type.includes("Depot") || t.type.includes("Recharge");
                    return (
                      <div key={t.id} className="transaction-item-row">
                        <div className="txn-left-block">
                          <div className={`txn-icon-circle ${isPositive ? "in" : ""}`}>
                            {isPositive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <strong style={{ fontSize: 13, display: "block" }}>{t.type}</strong>
                            <span style={{ fontSize: 11, color: "var(--ink-tertiary)" }}>{t.date.split(" ")[0]}</span>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div className={isPositive ? "txn-amount-green" : "txn-amount-black"}>
                            {isPositive ? "+" : "-"} {formatFCFA(t.montant)}
                          </div>
                          <button
                            type="button"
                            onClick={() => openReceiptModal(t.reference || String(t.id))}
                            style={{ background: "transparent", border: "none", color: "var(--ink-tertiary)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            Reçu PDF
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {transactions.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--ink-tertiary)", fontSize: 13 }}>
                      Aucune transaction récente enregistrée.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ============================================================
            VUE 2 : MES COMPTES & CARTES
            ============================================================ */}
        {activeTab === "accounts" && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Mes Comptes & Cartes Virtuelles
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Carte Virtuelle Platinum Black & Electric Touch */}
              <div
                style={{
                  background: "linear-gradient(145deg, #0A0A0A 0%, #1A1A1E 100%)",
                  borderRadius: 24, padding: 32, color: "#FFFFFF", position: "relative",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.3)", border: "1px solid #2B2B30", minHeight: 220,
                  display: "flex", flexDirection: "column", justifyContent: "space-between"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 42, height: 30, background: "linear-gradient(135deg, #FBBF24 0%, #D97706 100%)", borderRadius: 6 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1, color: "#EEEBDA" }}>MINIBANK PLATINUM</span>
                  </div>
                  <CreditCard size={24} color="#EEEBDA" />
                </div>

                <div style={{ fontFamily: "var(--mono)", fontSize: 20, letterSpacing: 4, margin: "24px 0", color: "#FFFFFF" }}>
                  •••• •••• •••• {String(user.numero).slice(-4)}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: "#8A8F9B" }}>Titulaire</span>
                    <strong style={{ display: "block", fontSize: 14, textTransform: "uppercase" }}>{user.titulaire}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, textTransform: "uppercase", color: "#8A8F9B" }}>Expire</span>
                    <strong style={{ display: "block", fontSize: 14, fontFamily: "var(--mono)" }}>11/29</strong>
                  </div>
                </div>
              </div>

              {/* Détails du compte bancaire */}
              <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Coordonnées Bancaires (RIB)</h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F0F0F0", paddingBottom: 10 }}>
                    <span style={{ color: "#6E7381", fontSize: 13 }}>Titulaire :</span>
                    <strong>{user.titulaire}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F0F0F0", paddingBottom: 10 }}>
                    <span style={{ color: "#6E7381", fontSize: 13 }}>Numéro de Compte :</span>
                    <strong style={{ fontFamily: "var(--mono)" }}>{user.numero}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F0F0F0", paddingBottom: 10 }}>
                    <span style={{ color: "#6E7381", fontSize: 13 }}>Type :</span>
                    <strong>{user.typeCompte}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F0F0F0", paddingBottom: 10 }}>
                    <span style={{ color: "#6E7381", fontSize: 13 }}>Devise :</span>
                    <strong style={{ color: "#4F46E5" }}>Franc CFA (XOF)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#6E7381", fontSize: 13 }}>Statut :</span>
                    <span style={{ background: "rgba(79, 70, 229, 0.12)", color: "#312E81", padding: "4px 10px", borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
                      Actif & Sécurisé
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            VUE 3 : VIREMENTS & BÉNÉFICIAIRES
            ============================================================ */}
        {activeTab === "transfers" && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Virements Bancaires & Bénéficiaires
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24 }}>
              {/* Formulaire Virement */}
              <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Émettre un Virement Instantané</h3>
                <p style={{ color: "#6E7381", fontSize: 13, marginBottom: 24 }}>
                  Transaction atomique ACID sans frais vers tout compte MiniBank.
                </p>

                <form onSubmit={handleTransferPreview}>
                  <div className="field-group">
                    <label className="field-label">Choisir un bénéficiaire enregistré</label>
                    <select
                      className="field-select"
                      value={transferDest}
                      onChange={(e) => setTransferDest(e.target.value)}
                    >
                      <option value="">-- Sélectionner ou saisir manuellement ci-dessous --</option>
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.numeroCompte || b.numeroCompteCible}>
                          {b.nom || b.nomAlias} (N° {b.numeroCompte || b.numeroCompteCible})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Numéro du compte destinataire</label>
                    <input
                      type="number"
                      className="field-input"
                      value={transferDest}
                      onChange={(e) => setTransferDest(e.target.value)}
                      placeholder="Ex : 464029629"
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Montant du virement (FCFA)</label>
                    <input
                      type="number"
                      className="field-input"
                      value={transferMontant}
                      onChange={(e) => setTransferMontant(e.target.value)}
                      placeholder="Ex : 50000"
                      min={100}
                      step={100}
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Motif du virement (optionnel)</label>
                    <input
                      type="text"
                      className="field-input"
                      value={transferMotif}
                      onChange={(e) => setTransferMotif(e.target.value)}
                      placeholder="Ex : Loyer, Remboursement..."
                    />
                  </div>

                  <button type="submit" className="btn-electric-submit">
                    <Send size={16} /> Vérifier le bénéficiaire & Confirmer
                  </button>
                </form>
              </div>

              {/* Carnet de Bénéficiaires */}
              <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Mes Bénéficiaires</h3>
                  <button
                    type="button"
                    onClick={() => setIsAddBenefModalOpen(true)}
                    className="btn-black-pill"
                    style={{ padding: "8px 14px", fontSize: 12 }}
                  >
                    <Plus size={14} color="#EEEBDA" /> Ajouter
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {beneficiaries.map((b) => (
                    <div
                      key={b.id}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "14px 16px", borderRadius: 16, background: "var(--bg-surface-subtle)",
                        border: "1px solid var(--border-light)"
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 14, display: "block" }}>{b.nom || b.nomAlias}</strong>
                        <span style={{ fontSize: 12, color: "#6E7381", fontFamily: "var(--mono)" }}>
                          N° {b.numeroCompte || b.numeroCompteCible}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setTransferDest(String(b.numeroCompte || b.numeroCompteCible));
                            notify(`Destinataire ${b.nom || b.nomAlias} sélectionné.`, "success");
                          }}
                          className="btn-white-pill"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                        >
                          Virer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBeneficiary(b.id)}
                          style={{ background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", padding: 6 }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {beneficiaries.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A8F9B", fontSize: 13 }}>
                      Aucun contact enregistré. Cliquez sur « Ajouter » pour enregistrer un bénéficiaire régulier.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            VUE 4 : SERVICES MOBILE MONEY
            ============================================================ */}
        {activeTab === "mobile_money" && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Paiements & Recharges Mobile Money
            </h2>

            <div style={{ maxWidth: 680, margin: "0 auto", background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 36 }}>
              {/* Toggle Mode : Recharge vs Retrait */}
              <div style={{ display: "flex", background: "#F4F5F7", padding: 6, borderRadius: 9999, marginBottom: 28 }}>
                <button
                  type="button"
                  onClick={() => setMmMode("recharge")}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 9999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
                    background: mmMode === "recharge" ? "#0A0A0A" : "transparent",
                    color: mmMode === "recharge" ? "#EEEBDA" : "#6E7381",
                  }}
                >
                  Recharger mon compte
                </button>
                <button
                  type="button"
                  onClick={() => setMmMode("retrait")}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 9999, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
                    background: mmMode === "retrait" ? "#0A0A0A" : "transparent",
                    color: mmMode === "retrait" ? "#EEEBDA" : "#6E7381",
                  }}
                >
                  Retirer vers Mobile Money
                </button>
              </div>

              <form onSubmit={handleMobileMoney}>
                <div className="field-group">
                  <label className="field-label">Sélectionner l'opérateur partenaire</label>
                  <div className="operators-selection-grid">
                    {[
                      { name: "Orange Money", renderLogo: () => <OrangeMoneyLogo size={44} /> },
                      { name: "MTN MoMo", renderLogo: () => <MtnMoMoLogo size={44} /> },
                      { name: "Wave", renderLogo: () => <WaveLogo size={44} /> },
                      { name: "Moov Money", renderLogo: () => <MoovMoneyLogo size={44} /> },
                    ].map((op) => (
                      <div
                        key={op.name}
                        className={`operator-card ${mmOp === op.name ? "selected" : ""}`}
                        onClick={() => setMmOp(op.name)}
                        style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 10px" }}
                      >
                        {op.renderLogo()}
                        <span style={{ fontSize: 13, fontWeight: 700, textAlign: "center", color: "#0A0A0A" }}>{op.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">Numéro de téléphone mobile</label>
                  <input
                    type="tel"
                    className="field-input"
                    value={mmTel}
                    onChange={(e) => setMmTel(e.target.value)}
                    placeholder="Ex : 0701020304"
                    required
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Montant de la transaction (FCFA)</label>
                  <input
                    type="number"
                    className="field-input"
                    value={mmMontant}
                    onChange={(e) => setMmMontant(e.target.value)}
                    placeholder="Ex : 25000"
                    min={500}
                    step={100}
                    required
                  />
                </div>

                <button type="submit" className="btn-electric-submit">
                  <Smartphone size={16} />
                  {mmMode === "recharge" ? "Recharger immédiatement" : "Transférer vers le portefeuille mobile"}
                </button>
              </form>
            </div>
          </div>
        )}


        {/* ============================================================
            VUE 6 : HISTORIQUE & REÇUS OFFICIELS
            ============================================================ */}
        {activeTab === "history" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Historique des Transactions</h2>
                <span style={{ color: "#6E7381", fontSize: 13 }}>Registre immuable des opérations avec reçus certifiés</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: "#8A8F9B" }} />
                  <input
                    type="text"
                    placeholder="Filtrer par réf, libellé..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="field-input"
                    style={{ paddingLeft: 40, height: 44, width: 260 }}
                  />
                </div>
                <button type="button" onClick={loadTransactions} className="btn-white-pill" style={{ height: 44 }}>
                  Actualiser
                </button>
              </div>
            </div>

            <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface-subtle)", borderBottom: "1px solid var(--border-light)", color: "#8A8F9B", textAlign: "left", fontSize: 12, fontWeight: 700 }}>
                    <th style={{ padding: "16px 20px" }}>Date</th>
                    <th style={{ padding: "16px 20px" }}>Référence</th>
                    <th style={{ padding: "16px 20px" }}>Type</th>
                    <th style={{ padding: "16px 20px" }}>Détails / Bénéficiaire</th>
                    <th style={{ padding: "16px 20px", textAlign: "right" }}>Montant</th>
                    <th style={{ padding: "16px 20px", textAlign: "right" }}>Solde Résultant</th>
                    <th style={{ padding: "16px 20px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => {
                    const isPositive = t.type.includes("recu") || t.type.includes("Depot") || t.type.includes("Recharge");
                    return (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "16px 20px", color: "#6E7381" }}>{t.date}</td>
                        <td style={{ padding: "16px 20px", fontFamily: "var(--mono)", fontWeight: 700 }}>{t.reference || `TXN-${t.id}`}</td>
                        <td style={{ padding: "16px 20px" }}>
                          <span style={{ background: isPositive ? "rgba(79, 70, 229, 0.12)" : "#F4F5F7", color: isPositive ? "#312E81" : "#0A0A0A", padding: "4px 10px", borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
                            {t.type}
                          </span>
                        </td>
                        <td style={{ padding: "16px 20px", color: "var(--ink-secondary)" }}>
                          {t.detailsCible || (t.compteDest > 0 ? `Compte n° ${t.compteDest}` : "Guichet / DAB")}
                          {t.motif ? ` · ${t.motif}` : ""}
                        </td>
                        <td style={{ padding: "16px 20px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 800, color: isPositive ? "#4338CA" : "#0A0A0A" }}>
                          {isPositive ? "+" : "-"} {formatFCFA(t.montant)}
                        </td>
                        <td style={{ padding: "16px 20px", textAlign: "right", fontFamily: "var(--mono)" }}>
                          {formatFCFA(t.soldeApres)}
                        </td>
                        <td style={{ padding: "16px 20px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => openReceiptModal(t.reference || String(t.id))}
                            className="btn-white-pill"
                            style={{ padding: "6px 12px", fontSize: 12 }}
                          >
                            <Printer size={13} /> Reçu PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredTransactions.length === 0 && (
                <div style={{ textAlign: "center", padding: "50px", color: "#8A8F9B" }}>
                  Aucune transaction ne correspond à votre recherche.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            VUE 7 : SÉCURITÉ & PARAMÈTRES (CHANGEMENT PIN & 2FA)
            ============================================================ */}
        {activeTab === "security" && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Sécurité & Paramètres du Compte
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Changement de code PIN */}
              <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Changer mon Code PIN</h3>
                <p style={{ color: "#6E7381", fontSize: 13, marginBottom: 24 }}>
                  Le nouveau code sera chiffré via PBKDF2-HMAC-SHA256 avec un sel 128 bits.
                </p>

                <form onSubmit={handleChangePin}>
                  <div className="field-group">
                    <label className="field-label">Ancien code PIN (4 chiffres)</label>
                    <input
                      type="password"
                      maxLength={4}
                      className="field-input"
                      value={pinOld}
                      onChange={(e) => setPinOld(e.target.value)}
                      placeholder="••••"
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Nouveau code PIN (4 chiffres)</label>
                    <input
                      type="password"
                      maxLength={4}
                      className="field-input"
                      value={pinNew}
                      onChange={(e) => setPinNew(e.target.value)}
                      placeholder="••••"
                      required
                    />
                  </div>

                  <button type="submit" className="btn-black-pill" style={{ width: "100%", justifyContent: "center", padding: "14px" }}>
                    <Lock size={15} color="#4F46E5" /> Mettre à jour le code PIN
                  </button>
                </form>
              </div>

              {/* Double Facteur 2FA TOTP Google Authenticator */}
              <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>Authentification TOTP Google Authenticator</h3>
                  <span
                    style={{
                      background: user.mfaEnabled ? "rgba(79, 70, 229, 0.12)" : "#F4F5F7",
                      color: user.mfaEnabled ? "#312E81" : "#6E7381",
                      padding: "4px 12px", borderRadius: 9999, fontSize: 12, fontWeight: 700
                    }}
                  >
                    {user.mfaEnabled ? "Actif (Protégé)" : "Désactivé"}
                  </span>
                </div>
                <p style={{ color: "#6E7381", fontSize: 13, marginBottom: 24 }}>
                  Conformité RFC 6238 TOTP : génère un code sécurisé tournant toutes les 30 secondes sur votre application mobile.
                </p>

                {!user.mfaEnabled ? (
                  !mfaSetupData ? (
                    <button type="button" onClick={handleStartMfaSetup} className="btn-electric-submit">
                      <Shield size={16} /> Configurer Google Authenticator
                    </button>
                  ) : (
                    <div style={{ background: "var(--bg-surface-subtle)", padding: 24, borderRadius: 20, border: "1px solid var(--border-light)" }}>
                      <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--midnight-indigo)" }}>
                        1. Scannez le QR Code dans l'application
                      </h4>
                      <p style={{ color: "#6E7381", fontSize: 12.5, marginBottom: 14 }}>
                        Ouvrez Google Authenticator (ou Authy) sur votre smartphone et scannez ce code :
                      </p>

                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                        <div style={{ background: "#FFFFFF", padding: 12, borderRadius: 16, border: "1px solid var(--border-light)", display: "inline-block", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaSetupData.uri)}`}
                            alt="QR Code Google Authenticator"
                            style={{ width: 180, height: 180, display: "block" }}
                          />
                        </div>
                      </div>

                      <div style={{ background: "#FFFFFF", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border-light)", marginBottom: 18 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6E7381", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                          Ou saisie manuelle de la clé secrète :
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <code style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 15, letterSpacing: 2, color: "var(--midnight-indigo)" }}>
                            {mfaSetupData.secret}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(mfaSetupData.secret);
                              notify("Clé secrète copiée !", "success");
                            }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--midnight-indigo-electric)", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 12 }}
                          >
                            <Copy size={14} /> Copier
                          </button>
                        </div>
                      </div>

                      <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--midnight-indigo)" }}>
                        2. Saisissez le code à 6 chiffres affiché
                      </h4>
                      <input
                        type="text"
                        maxLength={6}
                        className="field-input"
                        value={mfaConfirmInput}
                        onChange={(e) => setMfaConfirmInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="123456"
                        style={{ textAlign: "center", letterSpacing: 6, fontSize: 22, fontFamily: "var(--mono)", marginBottom: 14 }}
                      />
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="button" onClick={handleConfirmMfa} className="btn-electric-submit" style={{ flex: 1 }}>
                          Valider et activer TOTP
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMfaSetupData(null); setMfaConfirmInput(""); }}
                          style={{ padding: "12px 18px", background: "transparent", border: "1px solid var(--border-light)", borderRadius: 14, color: "#6E7381", cursor: "pointer", fontWeight: 700 }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div>
                    <div className="field-group">
                      <label className="field-label">Confirmez votre PIN pour désactiver le 2FA :</label>
                      <input
                        type="password"
                        maxLength={4}
                        className="field-input"
                        value={mfaDisablePin}
                        onChange={(e) => setMfaDisablePin(e.target.value)}
                        placeholder="••••"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleDisableMfa}
                      style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "12px 20px", borderRadius: 16, width: "100%", fontWeight: 700, cursor: "pointer" }}
                    >
                      Désactiver le double facteur
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            VUE 8 : SUPERVISION ADMINISTRATEUR & AUDIT LOGS (ADMIN ONLY)
            ============================================================ */}
        {activeTab === "admin" && user.isAdmin && (
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Console de Supervision Bancaire & Piste d'Audit
            </h2>

            {/* KPI Globaux */}
            {adminStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 20, padding: 22 }}>
                  <span style={{ fontSize: 12, color: "#8A8F9B", fontWeight: 700 }}>Comptes Enregistrés</span>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{adminStats.nbComptesTotal}</div>
                </div>
                <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 20, padding: 22 }}>
                  <span style={{ fontSize: 12, color: "#8A8F9B", fontWeight: 700 }}>Comptes Actifs</span>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: "#4F46E5" }}>{adminStats.nbComptesActifs}</div>
                </div>
                <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 20, padding: 22 }}>
                  <span style={{ fontSize: 12, color: "#8A8F9B", fontWeight: 700 }}>Masse Monétaire</span>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{formatFCFA(adminStats.masseTotale)}</div>
                </div>
                <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 20, padding: 22 }}>
                  <span style={{ fontSize: 12, color: "#8A8F9B", fontWeight: 700 }}>Transactions Globales</span>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{adminStats.nbTransactions}</div>
                </div>
              </div>
            )}

            {/* Liste de tous les comptes clients */}
            <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Tous les Comptes Clients</h3>
                <button
                  type="button"
                  onClick={() => setIsAdminAddCompteOpen(true)}
                  className="btn-electric-submit"
                  style={{ padding: "8px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Plus size={16} /> Ouvrir un compte client
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface-subtle)", borderBottom: "1px solid var(--border-light)", color: "#8A8F9B", textAlign: "left", fontSize: 12, fontWeight: 700 }}>
                      <th style={{ padding: "12px 16px" }}>N° Compte</th>
                      <th style={{ padding: "12px 16px" }}>Titulaire</th>
                      <th style={{ padding: "12px 16px" }}>Type</th>
                      <th style={{ padding: "12px 16px", textAlign: "right" }}>Solde</th>
                      <th style={{ padding: "12px 16px" }}>Statut</th>
                      <th style={{ padding: "12px 16px" }}>2FA</th>
                      <th style={{ padding: "12px 16px", textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAccounts.map((c) => (
                      <tr key={c.numero} style={{ borderBottom: "1px solid #F0F0F0" }}>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--mono)", fontWeight: 700 }}>{c.numero}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>{c.titulaire}</td>
                        <td style={{ padding: "12px 16px" }}>{c.typeCompte}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700 }}>{formatFCFA(c.solde)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, background: c.actif ? "#DCFCE7" : "#FEE2E2", color: c.actif ? "#166534" : "#991B1B" }}>
                            {c.actif ? "Actif" : "Suspendu"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {c.mfaEnabled ? <span style={{ color: "#4F46E5", fontWeight: 800 }}>TOTP Actif</span> : <span style={{ color: "#9CA3AF" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {c.isAdmin ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8F9B", fontStyle: "italic" }}>Compte Maître</span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleToggleCompteStatut(c.numero, !c.actif)}
                                style={{
                                  background: c.actif ? "#FEF2F2" : "#DCFCE7",
                                  color: c.actif ? "#DC2626" : "#166534",
                                  border: `1px solid ${c.actif ? "#FECACA" : "#86EFAC"}`,
                                  borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                                }}
                              >
                                {c.actif ? "Suspendre" : "Réactiver"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCompte(c.numero, c.titulaire)}
                                style={{
                                  background: "#FEF2F2",
                                  color: "#DC2626",
                                  border: "1px solid #FECACA",
                                  borderRadius: 8, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center",
                                }}
                                title="Supprimer définitivement ce compte"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Piste d'Audit & Journal des Événements */}
            <div style={{ background: "#FFFFFF", border: "1px solid var(--border-light)", borderRadius: 24, padding: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>Piste d'Audit & Journal des Événements</h3>
                <button type="button" onClick={loadAdminData} className="btn-white-pill" style={{ padding: "8px 14px", fontSize: 12 }}>
                  Actualiser les logs
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface-subtle)", borderBottom: "1px solid var(--border-light)", color: "#8A8F9B", textAlign: "left", fontSize: 12, fontWeight: 700 }}>
                      <th style={{ padding: "12px 16px" }}>Date & Heure</th>
                      <th style={{ padding: "12px 16px" }}>Sévérité</th>
                      <th style={{ padding: "12px 16px" }}>Action</th>
                      <th style={{ padding: "12px 16px" }}>Compte Cible</th>
                      <th style={{ padding: "12px 16px" }}>IP Source</th>
                      <th style={{ padding: "12px 16px" }}>Détails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminLogs.map((l) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #F0F0F0" }}>
                        <td style={{ padding: "12px 16px", color: "#6E7381", whiteSpace: "nowrap" }}>{l.date || l.timestamp}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)",
                              background: l.niveau === "ALERT" ? "#FEE2E2" : l.niveau === "WARN" ? "#FEF3C7" : "#DCFCE7",
                              color: l.niveau === "ALERT" ? "#991B1B" : l.niveau === "WARN" ? "#92400E" : "#166534"
                            }}
                          >
                            {l.niveau || l.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>{l.action || l.eventType}</td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--mono)" }}>{l.compteNumero > 0 ? l.compteNumero : "Système"}</td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--mono)", color: "#6E7381" }}>{l.ip || l.ipAddress}</td>
                        <td style={{ padding: "12px 16px" }}>{l.details || l.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* ============================================================
          MODAL 1 : APERÇU DE VIREMENT (2-STEP VERIFICATION)
          ============================================================ */}
      {previewTransfer && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/img/logo.png" alt="MiniBank" style={{ maxHeight: 36, width: "auto", borderRadius: 6 }} />
                <div>
                  <strong style={{ fontSize: 16 }}>Confirmation du Virement</strong>
                  <span style={{ display: "block", fontSize: 11, color: "#6E7381" }}>MiniBank Instant Transfer</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTransfer(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "var(--bg-surface-subtle)", borderRadius: 16, padding: "20px", textAlign: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: "#6E7381", textTransform: "uppercase", fontWeight: 700 }}>Montant à Transférer</span>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#0A0A0A", marginTop: 4 }}>
                {formatFCFA(previewTransfer.montant)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Bénéficiaire Résolu :</span>
                <strong>{previewTransfer.destTitulaire}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Compte Destinataire :</span>
                <strong style={{ fontFamily: "var(--mono)" }}>N° {previewTransfer.dest}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Motif :</span>
                <strong>{previewTransfer.motif}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6E7381" }}>Frais de Transfert :</span>
                <strong style={{ color: "#4F46E5" }}>0 FCFA (Gratuit)</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" onClick={handleExecuteTransfer} className="btn-electric-submit" style={{ flex: 1 }}>
                Confirmer & Débiter
              </button>
              <button type="button" onClick={() => setPreviewTransfer(null)} className="btn-white-pill">
                Modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 2 : REÇU BANCAIRE OFFICIEL (IMPRESSION PDF DIRECTE)
          ============================================================ */}
      {receiptTxn && (
        <div className="modal-backdrop">
          <div className="modal-sheet" style={{ maxWidth: 580 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0A0A0A", paddingBottom: 16, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src="/img/logo.png" alt="MiniBank" style={{ maxHeight: 40, width: "auto", borderRadius: 6 }} />
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>MiniBank S.A.</h3>
                  <span style={{ fontSize: 11, color: "#6E7381", textTransform: "uppercase", letterSpacing: 0.5 }}>Bordereau Officiel de Transaction</span>
                </div>
              </div>
              <span style={{ border: "1.5px solid #4F46E5", color: "#312E81", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>
                Certifié Conforme
              </span>
            </div>

            <div style={{ background: "var(--bg-surface-subtle)", borderRadius: 16, padding: 20, textAlign: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 12, color: "#6E7381", textTransform: "uppercase", fontWeight: 700 }}>Montant de l'opération</span>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#0A0A0A", marginTop: 4 }}>
                {formatFCFA(receiptTxn.montant)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Référence Bancaire :</span>
                <strong style={{ fontFamily: "var(--mono)" }}>{receiptTxn.reference || `TXN-${receiptTxn.id}`}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Date et Heure :</span>
                <strong>{receiptTxn.date}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Type d'Opération :</span>
                <strong>{receiptTxn.type}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Compte Émetteur :</span>
                <strong style={{ fontFamily: "var(--mono)" }}>{receiptTxn.compteSource > 0 ? `N° ${receiptTxn.compteSource}` : "Guichet Central"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #E5E7EB", paddingBottom: 8 }}>
                <span style={{ color: "#6E7381" }}>Bénéficiaire / Cible :</span>
                <strong>{receiptTxn.detailsCible || (receiptTxn.compteDest > 0 ? `Compte n° ${receiptTxn.compteDest}` : "—")}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6E7381" }}>Statut d'Exécution :</span>
                <span style={{ color: "#4338CA", fontWeight: 800 }}>Exécuté avec succès</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-electric-submit"
                style={{ flex: 1 }}
              >
                <Printer size={16} /> Imprimer / Télécharger en PDF
              </button>
              <button
                type="button"
                onClick={() => setReceiptTxn(null)}
                className="btn-white-pill"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 3 : AJOUTER UN BÉNÉFICIAIRE
          ============================================================ */}
      {isAddBenefModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Nouveau Bénéficiaire</h3>
            <form onSubmit={handleAddBeneficiary}>
              <div className="field-group">
                <label className="field-label">Numéro de compte MiniBank</label>
                <input
                  type="number"
                  className="field-input"
                  value={newBenefNum}
                  onChange={(e) => setNewBenefNum(e.target.value)}
                  placeholder="Ex : 464029629"
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Nom ou surnom usuel</label>
                <input
                  type="text"
                  className="field-input"
                  value={newBenefNom}
                  onChange={(e) => setNewBenefNom(e.target.value)}
                  placeholder="Ex : Fatou Diallo"
                  required
                />
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button type="submit" className="btn-electric-submit" style={{ flex: 1 }}>
                  Enregistrer
                </button>
                <button type="button" onClick={() => setIsAddBenefModalOpen(false)} className="btn-white-pill">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 4 : OUVERTURE DE COMPTE CLIENT (ADMIN)
          ============================================================ */}
      {isAdminAddCompteOpen && (
        <div className="modal-backdrop">
          <div className="modal-sheet" style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800 }}>Ouvrir un nouveau compte client</h3>
              <button
                type="button"
                onClick={() => setIsAdminAddCompteOpen(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdminCreateCompte}>
              <div className="field-group">
                <label className="field-label">Nom et Prénom du titulaire</label>
                <input
                  type="text"
                  className="field-input"
                  value={adminNewTitulaire}
                  onChange={(e) => setAdminNewTitulaire(e.target.value)}
                  placeholder="Ex : Koffi Kouassi"
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Type de compte</label>
                <select
                  className="field-input"
                  value={adminNewType}
                  onChange={(e) => setAdminNewType(e.target.value)}
                >
                  <option value="Courant">Compte Courant</option>
                  <option value="Epargne">Compte Épargne</option>
                  <option value="Pro">Compte Professionnel</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Dépôt initial (FCFA)</label>
                <input
                  type="number"
                  className="field-input"
                  value={adminNewSolde}
                  onChange={(e) => setAdminNewSolde(e.target.value)}
                  min={0}
                  step={100}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label">Code PIN confidentiel (4 chiffres)</label>
                <input
                  type="password"
                  className="field-input"
                  value={adminNewPin}
                  onChange={(e) => setAdminNewPin(e.target.value)}
                  maxLength={4}
                  placeholder="Ex : 1234"
                  required
                />
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button type="submit" className="btn-electric-submit" style={{ flex: 1 }}>
                  Valider l'ouverture
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdminAddCompteOpen(false)}
                  className="btn-white-pill"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
