import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MsToClockStringPipe } from '../../ui/duration/ms-to-clock-string.pipe';

export interface DailyJourneyReport {
  date: string;
  productiveMs: number;
  completedTasks: number;
  totalTasks: number;
  xpEarned: number;
  coinBalance: number;
  petName: string;
  petXp: number;
  bossDamage: number;
}

@Component({
  selector: 'daily-journey-report',
  standalone: true,
  imports: [MatIcon, MsToClockStringPipe],
  template: `
    <div class="backdrop">
      <section class="report" role="dialog" aria-modal="true" aria-label="Relatório da jornada">
        <div class="rays"></div>
        <span class="kicker">CRÔNICAS DO AVENTUREIRO</span>
        <mat-icon class="emblem">auto_stories</mat-icon>
        <h2>JORNADA CONCLUÍDA</h2>
        <p class="date">{{ report().date }}</p>

        <div class="summary">
          <article class="wide">
            <mat-icon>schedule</mat-icon>
            <span>Tempo produtivo</span>
            <strong>{{ report().productiveMs | msToClockString }}</strong>
          </article>
          <article>
            <mat-icon>task_alt</mat-icon>
            <span>Missões completas</span>
            <strong>{{ report().completedTasks }}/{{ report().totalTasks }}</strong>
          </article>
          <article>
            <mat-icon>auto_awesome</mat-icon>
            <span>XP conquistado</span>
            <strong>+{{ report().xpEarned }}</strong>
          </article>
          <article>
            <mat-icon>paid</mat-icon>
            <span>Saldo de moedas</span>
            <strong>{{ report().coinBalance }}</strong>
          </article>
          <article>
            <mat-icon>fort</mat-icon>
            <span>Dano no chefe</span>
            <strong>{{ report().bossDamage }}</strong>
          </article>
          <article class="wide">
            <mat-icon>pets</mat-icon>
            <span>{{ report().petName || 'Mascote' }}</span>
            <strong>{{ report().petXp }} XP de vínculo</strong>
          </article>
        </div>

        <p class="lore">O dia termina, mas cada conquista permanece registrada na sua história.</p>
        <button type="button" (click)="confirm.emit()">ENCERRAR O DIA</button>
        <button type="button" class="back" (click)="cancel.emit()">VOLTAR</button>
      </section>
    </div>
  `,
  styles: `
    .backdrop{position:fixed;z-index:10001;inset:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle,rgba(100,39,75,.34),transparent 44%),rgba(2,2,10,.94);backdrop-filter:blur(9px);animation:fade .25s ease-out}
    .report{position:relative;isolation:isolate;overflow:hidden;width:min(650px,95vw);max-height:92vh;overflow-y:auto;padding:38px 44px 30px;border:3px double #e7b84f;box-sizing:border-box;color:#f7f1ff;background:linear-gradient(rgba(29,22,51,.96),rgba(10,8,24,.98)),url('/assets/rpg/dungeon-profile-background.png') center/cover;box-shadow:0 0 0 5px #451523,0 0 75px #f0b6404a;text-align:center;animation:rise .45s cubic-bezier(.2,1.2,.35,1)}
    h2{margin:8px 0 0;color:#ffe39a;font:900 34px/1.1 monospace;letter-spacing:3px;text-shadow:0 3px #64172a,0 0 18px #ffd15c77}.kicker{color:#e7b84f;font:700 10px monospace;letter-spacing:3px}.date{margin:8px 0 19px;color:#bcb1cf;font:12px monospace}.emblem{display:block;width:54px;height:54px;margin:14px auto 0;color:#ffd866;font-size:54px;filter:drop-shadow(0 0 13px #cb7332)}
    .summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left}.summary article{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;min-height:52px;padding:8px 11px;border:1px solid #8e6b2f;background:#070713a8}.summary article.wide{grid-column:1/-1}.summary mat-icon{color:#e9ba4c}.summary span{color:#bcb3ca;font-size:11px}.summary strong{color:#ffe08a;font:800 13px monospace}
    .lore{margin:18px 0 6px;color:#a99db9;font:italic 11px/1.5 serif}.report>button{min-width:220px;margin-top:16px;padding:12px 22px;border:2px solid #e7b84f;color:#1a0e08;background:linear-gradient(#ffe08a,#c78925);font:900 13px monospace;letter-spacing:1px;cursor:pointer}.report>button.back{display:block;min-width:0;margin:8px auto 0;padding:5px 12px;border:0;color:#a99db9;background:transparent;font-size:10px}
    .rays{position:absolute;z-index:-1;top:-190px;left:50%;width:460px;height:460px;background:repeating-conic-gradient(from 0deg,#ffe07610 0 7deg,transparent 7deg 18deg);transform:translateX(-50%);animation:spin 30s linear infinite}@keyframes fade{from{opacity:0}}@keyframes rise{from{opacity:0;transform:scale(.76) translateY(28px)}}@keyframes spin{to{transform:translateX(-50%) rotate(360deg)}}@media(max-width:550px){.report{padding:30px 18px}.summary{grid-template-columns:1fr}.summary article,.summary article.wide{grid-column:1}}
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyJourneyReportComponent {
  readonly report = input.required<DailyJourneyReport>();
  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
