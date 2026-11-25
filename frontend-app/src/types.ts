// ============================================================
// MiniBank Pro — Types & Modèles TypeScript
// ============================================================

export interface Compte {
  numero: number;
  titulaire: string;
  solde: number;
  devise: string;
  typeCompte: string;
  actif: boolean;
  isAdmin: boolean;
  role: string;
  mfaEnabled: boolean;
  limiteVirementJour: number;
  dateCreation: string;
}

export interface Transaction {
  id: number;
  reference: string;
  idempotencyKey?: string;
  compteSource: number;
  compteDest: number;
  type: string;
  operateur?: string;
  detailsCible?: string;
  montant: number;
  date: string;
  soldeApres: number;
  statut: string;
  motif?: string;
  sourceTitulaire?: string;
  destTitulaire?: string;
}

export interface Beneficiaire {
  id: number;
  compteProprietaire: number;
  numeroCompteCible: number;
  numeroCompte?: number;
  nomAlias: string;
  nom?: string;
  email?: string;
  dateAjout?: string;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  date?: string;
  compteNumero: number;
  eventType: string;
  action?: string;
  description: string;
  details?: string;
  ipAddress: string;
  ip?: string;
  status: string;
  niveau?: 'INFO' | 'WARN' | 'ALERT';
}

export interface AdminStats {
  nbComptesTotal: number;
  nbComptesActifs: number;
  masseTotale: number;
  nbTransactions: number;
}
