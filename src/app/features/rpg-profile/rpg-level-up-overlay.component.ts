import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RpgProfileService } from './rpg-profile.service';

@Component({
  selector: 'rpg-level-up-overlay',
  standalone: true,
  imports: [MatIcon],
  template: `
    @if (profile.levelUpCelebration(); as celebration) {
      <div class="backdrop">
        <section class="modal">
          <div class="rays"></div>
          <span class="kicker">JORNADA DO AVENTUREIRO</span>
          <mat-icon class="crown">workspace_premium</mat-icon>
          <h2>PARABÉNS!</h2>
          <p>Você passou de nível</p>
          <div class="level-number">
            <small>NÍVEL</small>
            <strong>{{ celebration.currentLevel }}</strong>
          </div>
          @if (celebration.previousLevel + 1 < celebration.currentLevel) {
            <span class="level-jump">
              Níveis {{ celebration.previousLevel + 1 }}–{{ celebration.currentLevel }}
              conquistados
            </span>
          }
          <div class="rewards">
            <h3>RECOMPENSAS</h3>
            <div>
              <mat-icon>auto_awesome</mat-icon>
              <span>
                <strong>+{{ celebration.starPoints }} Star Point{{ celebration.starPoints > 1 ? 's' : '' }}</strong>
                <small>Use nas Constelações do Destino</small>
              </span>
            </div>
            @for (itemName of celebration.itemNames; track $index) {
              <div>
                <mat-icon>redeem</mat-icon>
                <span>
                  <strong>{{ itemName }}</strong>
                  <small>Novo item no inventário</small>
                </span>
              </div>
            }
            @for (unlock of celebration.unlocks; track unlock) {
              <div>
                <mat-icon>lock_open</mat-icon>
                <span>
                  <strong>{{ unlock }}</strong>
                  <small>Novo conteúdo liberado</small>
                </span>
              </div>
            }
          </div>
          <button
            type="button"
            (click)="profile.dismissLevelUpCelebration()"
          >
            CONTINUAR
          </button>
        </section>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      z-index: 10000;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle, rgba(49,43,121,.3), transparent 42%), rgba(2,2,10,.93);
      backdrop-filter: blur(9px);
      animation: backdrop-in 300ms ease-out;
    }
    .modal {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      width: min(560px, 94vw);
      padding: 38px 44px 34px;
      border: 3px double #e7b84f;
      box-sizing: border-box;
      color: #f5f0ff;
      background: linear-gradient(rgba(30,25,56,.96),rgba(12,10,28,.98)), url('/assets/rpg/dungeon-profile-background.png') center/cover;
      box-shadow: 0 0 0 5px rgba(72,35,15,.7),0 0 70px rgba(246,196,83,.36);
      text-align: center;
      animation: modal-in 480ms cubic-bezier(.2,1.25,.35,1);
    }
    .modal h2 {
      margin: 8px 0 0;
      color: #ffe6a0;
      font: 900 43px/1 monospace;
      letter-spacing: 4px;
      text-shadow: 0 3px #671b2a,0 0 18px rgba(255,209,92,.55);
    }
    .modal > p { margin: 8px 0 15px; color: #c9c1dd; }
    .modal > button {
      min-width: 210px;
      margin-top: 24px;
      padding: 13px 28px;
      border: 2px solid #e7b84f;
      color: #1a0e08;
      background: linear-gradient(#ffe08a,#c78925);
      font: 900 14px monospace;
      letter-spacing: 1px;
      cursor: pointer;
    }
    .modal > button:hover { filter: brightness(1.12); transform: translateY(-1px); }
    .kicker { color:#e7b84f; font:700 10px monospace; letter-spacing:3px; }
    .crown {
      display:block;
      width:58px;
      height:58px;
      margin:15px auto 0;
      color:#ffd866;
      font-size:58px;
      filter:drop-shadow(0 0 12px #cb7332);
      animation:pulse 1.7s ease-in-out infinite;
    }
    .level-number {
      display:grid;
      place-items:center;
      width:116px;
      height:116px;
      margin:0 auto 8px;
      border:3px double #f2c95f;
      border-radius:50%;
      background:radial-gradient(circle,#8a2e42,#2b173d 67%);
      box-shadow:inset 0 0 24px rgba(255,215,102,.2),0 0 24px rgba(246,196,83,.25);
    }
    .level-number small { align-self:end; color:#e8c66a; font:700 10px monospace; letter-spacing:2px; }
    .level-number strong { align-self:start; color:white; font:900 48px/1 monospace; }
    .level-jump { color:#b9add5; font:11px monospace; }
    .rewards { margin-top:20px; border:1px solid rgba(246,196,83,.34); background:rgba(4,4,14,.45); text-align:left; }
    .rewards h3 { margin:0; padding:8px 12px; border-bottom:1px solid rgba(246,196,83,.3); color:#e7b84f; font:800 11px monospace; letter-spacing:2px; }
    .rewards > div { display:flex; align-items:center; gap:12px; min-height:48px; padding:6px 13px; border-bottom:1px solid rgba(255,255,255,.07); }
    .rewards > div:last-child { border-bottom:0; }
    .rewards mat-icon { color:#ffd45f; }
    .rewards span,.rewards strong,.rewards small { display:block; }
    .rewards small { margin-top:2px; color:#aaa1bf; font-size:10px; }
    .rays {
      position:absolute;
      z-index:-1;
      top:-170px;
      left:50%;
      width:420px;
      height:420px;
      background:repeating-conic-gradient(from 0deg,rgba(255,224,118,.08) 0 7deg,transparent 7deg 18deg);
      transform:translateX(-50%);
      animation:spin 28s linear infinite;
    }
    @keyframes backdrop-in { from { opacity:0; } }
    @keyframes modal-in { from { opacity:0; transform:scale(.72) translateY(30px); } }
    @keyframes pulse { 50% { transform:scale(1.09); filter:drop-shadow(0 0 22px #e7a933); } }
    @keyframes spin { to { transform:translateX(-50%) rotate(360deg); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RpgLevelUpOverlayComponent {
  readonly profile = inject(RpgProfileService);
}
