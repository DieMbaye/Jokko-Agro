// src/app/components/admin/audit-trail/audit-trail.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditTrailService, AuditLog, AuditSeverity } from 'src/secure/services/audit-trail.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-audit-trail',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="audit-container">

  <div class="audit-header">
    <h1>🔎 Audit Trail — Journal de sécurité</h1>
    <p class="subtitle">Piste d'audit immuable. Aucun enregistrement ne peut être modifié ou supprimé.</p>
  </div>

  <!-- Statistiques -->
  <div class="stats-row" *ngIf="stats">
    <div class="stat-card">
      <div class="stat-value">{{ stats.total }}</div>
      <div class="stat-label">Événements total</div>
    </div>
    <div class="stat-card critical">
      <div class="stat-value">{{ stats.critical }}</div>
      <div class="stat-label">Alertes critiques</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-value">{{ stats.warning }}</div>
      <div class="stat-label">Avertissements</div>
    </div>
    <div class="stat-card info">
      <div class="stat-value">{{ stats.info }}</div>
      <div class="stat-label">Événements info</div>
    </div>
  </div>

  <!-- Filtres -->
  <div class="filters">
    <button
      *ngFor="let f of filters"
      class="filter-btn"
      [class.active]="activeFilter === f.value"
      (click)="applyFilter(f.value)"
    >
      {{ f.label }}
    </button>
  </div>

  <!-- Chargement -->
  <div *ngIf="isLoading" class="loading">
    <div class="spinner"></div>
    <p>Chargement de la piste d'audit…</p>
  </div>

  <!-- Liste des logs -->
  <div *ngIf="!isLoading" class="logs-list">
    <div
      *ngFor="let log of displayedLogs"
      class="log-entry"
      [class.critical]="log.severity === 'critical'"
      [class.warning]="log.severity === 'warning'"
      [class.info]="log.severity === 'info'"
    >
      <div class="log-header">
        <span class="severity-badge" [class]="'badge-' + log.severity">
          {{ severityIcon(log.severity) }} {{ log.severity | uppercase }}
        </span>
        <span class="log-action">{{ actionLabel(log.action) }}</span>
        <span class="log-date">{{ formatDate(log.createdAt) }}</span>
      </div>

      <div class="log-description">{{ log.description }}</div>

      <div class="log-meta">
        <span class="meta-item" *ngIf="log.actorId">
          👤 {{ log.actorEmail || log.actorId.substring(0, 12) + '…' }}
        </span>
        <span class="meta-item" *ngIf="log.amount">
          💰 {{ log.amount }} AGC
        </span>
        <span class="meta-item" *ngIf="log.blockHeight !== undefined">
          📦 Bloc #{{ log.blockHeight }}
        </span>
        <span class="meta-item" *ngIf="log.targetId">
          🎯 {{ log.targetType }}: {{ log.targetId.substring(0, 16) }}…
        </span>
      </div>
    </div>

    <div *ngIf="displayedLogs.length === 0" class="empty-state">
      <p>Aucun événement trouvé pour ce filtre.</p>
    </div>
  </div>

  <!-- Bouton charger plus -->
  <div class="load-more" *ngIf="displayedLogs.length >= pageSize">
    <button class="btn-load" (click)="loadMore()">Charger plus</button>
  </div>

</div>
  `,
  styles: [`
    .audit-container { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; }

    .audit-header { margin-bottom: 1.5rem; }
    .audit-header h1 { margin: 0 0 0.25rem; font-size: 1.8rem; }
    .subtitle { color: #6b7280; margin: 0; font-size: 0.9rem; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card { background: #f9fafb; border-radius: 10px; padding: 1rem; text-align: center; border-top: 3px solid #d1d5db; }
    .stat-card.critical { border-top-color: #ef4444; background: #fff5f5; }
    .stat-card.warning  { border-top-color: #f59e0b; background: #fffbeb; }
    .stat-card.info     { border-top-color: #3b82f6; background: #eff6ff; }
    .stat-value { font-size: 2rem; font-weight: 700; }
    .stat-label { font-size: 0.8rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }

    .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .filter-btn { padding: 0.4rem 1rem; border: 1px solid #d1d5db; border-radius: 20px; background: white; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
    .filter-btn.active, .filter-btn:hover { background: #1e40af; color: white; border-color: #1e40af; }

    .loading { text-align: center; padding: 3rem; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .logs-list { display: flex; flex-direction: column; gap: 0.75rem; }

    .log-entry { background: white; border-radius: 8px; padding: 1rem 1.25rem; border-left: 4px solid #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .log-entry.critical { border-left-color: #ef4444; background: #fff5f5; }
    .log-entry.warning  { border-left-color: #f59e0b; background: #fffdf0; }
    .log-entry.info     { border-left-color: #3b82f6; }

    .log-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .severity-badge { padding: 0.15rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700; }
    .badge-critical { background: #fee2e2; color: #b91c1c; }
    .badge-warning  { background: #fef3c7; color: #92400e; }
    .badge-info     { background: #dbeafe; color: #1e40af; }
    .log-action { font-weight: 600; font-size: 0.95rem; flex: 1; }
    .log-date { color: #9ca3af; font-size: 0.85rem; margin-left: auto; }

    .log-description { color: #374151; margin-bottom: 0.5rem; font-size: 0.95rem; }

    .log-meta { display: flex; gap: 1rem; flex-wrap: wrap; }
    .meta-item { font-size: 0.8rem; color: #6b7280; background: #f3f4f6; padding: 0.2rem 0.5rem; border-radius: 4px; }

    .empty-state { text-align: center; padding: 3rem; color: #9ca3af; background: #f9fafb; border-radius: 8px; }

    .load-more { text-align: center; margin-top: 1.5rem; }
    .btn-load { padding: 0.6rem 2rem; background: #1e40af; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    .btn-load:hover { background: #1e3a8a; }

    @media (max-width: 640px) {
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .log-date { display: none; }
    }
  `],
})
export class AuditTrailComponent implements OnInit {
  private auditTrail = inject(AuditTrailService);
  private authService = inject(AuthService);

  isLoading = true;
  allLogs: AuditLog[] = [];
  displayedLogs: AuditLog[] = [];
  activeFilter: string = 'all';
  pageSize = 50;
  stats: { total: number; critical: number; warning: number; info: number } | null = null;

  filters = [
    { label: 'Tous', value: 'all' },
    { label: '🚨 Critiques', value: 'critical' },
    { label: '⚠️ Warnings', value: 'warning' },
    { label: 'ℹ️ Info', value: 'info' },
    { label: '🔐 Escrow', value: 'escrow' },
    { label: '📦 Ledger', value: 'ledger' },
    { label: '💰 Achats', value: 'purchase' },
  ];

  async ngOnInit() {
    await this.loadLogs();
  }

  async loadLogs() {
    this.isLoading = true;
    try {
      this.allLogs = await this.auditTrail.getLogs({ limitCount: 200 });
      this.computeStats();
      this.applyFilter(this.activeFilter);
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter(filter: string) {
    this.activeFilter = filter;
    let filtered = this.allLogs;

    if (filter === 'critical') filtered = this.allLogs.filter(l => l.severity === 'critical');
    else if (filter === 'warning') filtered = this.allLogs.filter(l => l.severity === 'warning');
    else if (filter === 'info') filtered = this.allLogs.filter(l => l.severity === 'info');
    else if (filter === 'escrow') filtered = this.allLogs.filter(l => l.action.startsWith('escrow'));
    else if (filter === 'ledger') filtered = this.allLogs.filter(l => l.action.startsWith('ledger') || l.action.startsWith('signature') || l.action === 'tampering_detected');
    else if (filter === 'purchase') filtered = this.allLogs.filter(l => l.action === 'agc_purchase');

    this.displayedLogs = filtered.slice(0, this.pageSize);
  }

  loadMore() {
    const current = this.displayedLogs.length;
    const filtered = this.getFiltered();
    this.displayedLogs = filtered.slice(0, current + this.pageSize);
  }

  private getFiltered(): AuditLog[] {
    const f = this.activeFilter;
    if (f === 'critical') return this.allLogs.filter(l => l.severity === 'critical');
    if (f === 'warning')  return this.allLogs.filter(l => l.severity === 'warning');
    if (f === 'info')     return this.allLogs.filter(l => l.severity === 'info');
    if (f === 'escrow')   return this.allLogs.filter(l => l.action.startsWith('escrow'));
    if (f === 'ledger')   return this.allLogs.filter(l => l.action.startsWith('ledger') || l.action.startsWith('signature') || l.action === 'tampering_detected');
    if (f === 'purchase') return this.allLogs.filter(l => l.action === 'agc_purchase');
    return this.allLogs;
  }

  private computeStats() {
    this.stats = {
      total: this.allLogs.length,
      critical: this.allLogs.filter(l => l.severity === 'critical').length,
      warning:  this.allLogs.filter(l => l.severity === 'warning').length,
      info:     this.allLogs.filter(l => l.severity === 'info').length,
    };
  }

  severityIcon(s: AuditSeverity): string {
    return { critical: '🚨', warning: '⚠️', info: 'ℹ️' }[s] ?? '';
  }

  actionLabel(action: string): string {
    const labels: Record<string, string> = {
      agc_purchase:         'Achat AGC',
      agc_transfer:         'Transfert AGC',
      agc_bonus:            'Bonus AGC',
      escrow_lock:          'Séquestre — blocage',
      escrow_release:       'Séquestre — libération',
      escrow_cancel:        'Séquestre — annulation',
      ledger_verified:      'Ledger vérifié',
      ledger_corrupted:     'Ledger corrompu',
      signature_verified:   'Signature vérifiée',
      signature_invalid:    'Signature invalide',
      user_login:           'Connexion',
      user_logout:          'Déconnexion',
      keys_generated:       'Clés ECDSA générées',
      tampering_detected:   '🚨 Falsification détectée',
      unauthorized_access:  'Accès non autorisé',
      double_spend_attempt: '🚨 Tentative double-dépense',
    };
    return labels[action] ?? action;
  }

  formatDate(date: any): string {
    if (!date) return '—';
    const d = date instanceof Date ? date : date?.toDate?.() ?? new Date(date);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
  }
}
