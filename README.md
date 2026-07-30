# Questivity RPG

> Um RPG de produtividade local-first em que tarefas, estudos, leituras e hábitos fazem seu personagem evoluir.

<p align="center">
  <img src="build/rpg-app-icon.png" width="220" alt="Grimório encantado, ícone do Questivity RPG">
</p>

Questivity RPG é uma experiência pessoal construída sobre o [Super Productivity](https://github.com/super-productivity/super-productivity), um aplicativo gratuito e open source para tarefas, planejamento, foco e controle de tempo. Conheça o projeto original em [super-productivity.com](https://super-productivity.com/).

Esta versão mantém a base sólida do Super Productivity e adiciona uma camada de progressão inspirada em RPG: personagens em pixel art, XP, classes, mascotes, inventário, constelações de talentos, mundos, chefes, troféus e módulos de estudo e leitura.

## ✨ Principais recursos

- **Planejamento e foco:** tarefas, calendário semanal, blocos de foco, estimativas e timer integrado.
- **Perfil RPG:** múltiplos personagens, classes, subclasses, espécies, níveis, XP, ouro e atributos.
- **Constelações do Destino:** árvore de talentos navegável com caminhos e builds diferentes.
- **Inventário:** equipamentos, raridades, restrições por classe, venda, aprimoramento e fusão.
- **Mascotes:** vínculo permanente por personagem e evolução por estágios.
- **Mapa da jornada:** reinos desbloqueados conforme a progressão.
- **Habit Tracker:** hábitos ligados às tarefas do calendário e a personagens específicos.
- **Academia Arcana:** cursos, módulos, tópicos, sessões de estudo, flashcards, revisão espaçada, Markdown e desenhos.
- **Biblioteca Arcana:** catálogo, coleções, prateleiras, planejamento, calendário e registro de páginas lidas.
- **Salão de Troféus:** medalhas mensais e metas anuais calculadas a partir dos hábitos.
- **Relatório de jornada:** tela temática ao encerrar o dia com tempo produtivo, missões, XP, chefe e mascote.
- **Offline e local-first:** dados persistidos localmente, com arquitetura preparada para backup e sincronização.

## 🖼️ Identidade visual

O projeto combina a interface de produtividade do aplicativo original com uma direção visual fantasy RPG em pixel art. O ícone do aplicativo — um grimório encantado com um d20 — foi criado especialmente para esta versão.

## 🚀 Executando localmente

### Requisitos

- Node.js compatível com o projeto
- npm
- Git

### Desenvolvimento web

```bash
git clone https://github.com/Edu-png/super-productivity-rpg.git
cd super-productivity-rpg
npm install
npm start
```

### Electron

```bash
npm run electron:serve
```

Consulte os scripts disponíveis em `package.json` para builds e testes adicionais.

## 🎨 Assets opcionais

Alguns sprites utilizados durante o desenvolvimento local pertencem ao pacote **Ocean's Nostalgia — MZ Heroes**, de Ocean's Dream. Eles **não são redistribuídos neste repositório**. Para utilizá-los, obtenha sua própria cópia na [página oficial da autora](https://oceansdream.itch.io/) e respeite os termos do pacote, incluindo a exigência de possuir o RPG Maker MZ RTP.

Os itens provenientes de **RPG-Items**, de Jesse/GentleCatStudio, são disponibilizados sob [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Os demais assets devem ser consultados individualmente em seus respectivos arquivos de licença.

## 🧱 Arquitetura

A aplicação utiliza Angular, TypeScript e Electron. Os novos domínios são separados em módulos e serviços, com persistência preparada para grandes volumes de dados:

- RPG e personagens
- inventário
- mundo e progressão
- hábitos
- estudos e revisões
- biblioteca
- analytics
- sincronização

O objetivo é manter o aplicativo utilizável diariamente por muitos anos sem concentrar todo o estado em um único serviço ou armazenar grandes volumes em LocalStorage.

## 🤝 Relação com o projeto original

Este é um projeto derivado e experimental. Ele não é uma distribuição oficial nem possui afiliação com os mantenedores do Super Productivity.

Todo o crédito pela aplicação-base, arquitetura original e anos de trabalho da comunidade pertence ao projeto [super-productivity/super-productivity](https://github.com/super-productivity/super-productivity). Se esta versão for útil para você, considere também apoiar e contribuir com o projeto original.

## 📜 Licença

O código-base é distribuído sob a licença MIT, preservada em [LICENSE](LICENSE). Os assets podem possuir licenças próprias; consulte a seção de assets e os arquivos de licença antes de redistribuí-los.
