/* eslint-disable max-len -- prose content; lines are sentences, not code */
import {
  CareerContentBlock,
  CareerContentSection,
  CareerQuestContent,
  CareerQuestGrading,
} from './career-quest.model';
import { CAREER_CHALLENGE_BY_ID } from './career-quest.challenges';

/**
 * Structured content of quests that need more than an objective line.
 * promptContent is what the player sees once the quest starts; the rubric
 * and the solution are kept apart and only revealed on explicit request.
 */

const entryTestInstructions = (
  skillId: string,
  passRule: string,
): CareerContentSection => ({
  title: 'Instruções gerais',
  blocks: [
    {
      type: 'paragraph',
      text: 'O Teste de Entrada é um diagnóstico, não uma prova para "passar". Os níveis na Skill Tree hoje são PROVISÓRIOS: foram estimados pelo que você contou. O teste mede o que você consegue fazer SOZINHO hoje, para o Career Quest começar do ponto real.',
    },
    { type: 'heading', text: 'Regras' },
    {
      type: 'list',
      items: [
        'Sem IA: nada de ChatGPT, Claude ou Copilot; autocomplete de IA desligado.',
        'Pode consultar a documentação oficial; não pode copiar soluções prontas.',
        'Respeite o tempo e não estude antes: o objetivo é o retrato de hoje.',
        'Anote, para cada item: fiz sozinho / consultei a doc / não consegui.',
      ],
    },
    { type: 'heading', text: 'Como registrar o resultado' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Conclua a quest.',
        `Abra a skill ${skillId} → Registrar evidência → tipo Teste, nível L2, NO AI, Passou ou Falhou.`,
        'Salve os arquivos no repositório career-quest-lab e cole o link na evidência.',
      ],
    },
    { type: 'callout', tone: 'info', text: passRule },
    {
      type: 'callout',
      tone: 'warning',
      text: 'A rubrica e a solução ficam escondidas. Só abra depois de terminar: ver antes invalida o diagnóstico.',
    },
  ],
});

// ---------------------------------------------------------------- PYTHON
const PYTHON_ENTRY: CareerQuestContent = {
  promptContent: {
    sections: [
      entryTestInstructions(
        'PY-02',
        'Critério: 4 ou 5 exercícios feitos sozinho (doc permitida) → PASSOU. 3 ou menos → FALHOU, e PY-02 fica em L1 (tudo bem: é o ponto de partida real). Tempo: 90 minutos, tudo em python/entrada.py.',
      ),
      {
        title: '1. Estatísticas',
        blocks: [
          {
            type: 'paragraph',
            text: 'Escreva uma função que calcula média, mediana e moda de uma lista de números.',
          },
          { type: 'heading', text: 'Assinatura esperada' },
          {
            type: 'code',
            language: 'python',
            code: 'def estatisticas(numeros: list[float]) -> dict:\n    ...',
          },
          { type: 'heading', text: 'Requisitos' },
          {
            type: 'list',
            items: [
              'Devolver um dict com as chaves "media", "mediana" e "moda".',
              'Moda: se houver empate, devolver a menor.',
              'Lista vazia: levantar ValueError com mensagem clara.',
            ],
          },
          { type: 'heading', text: 'Exemplo' },
          {
            type: 'code',
            language: 'python',
            title: 'input',
            code: 'estatisticas([3, 1, 2, 2, 5])',
          },
          {
            type: 'code',
            language: 'python',
            title: 'output',
            code: '{"media": 2.6, "mediana": 2, "moda": 2}',
          },
        ],
      },
      {
        title: '2. CSV',
        blocks: [
          {
            type: 'paragraph',
            text: 'Crie você mesmo um arquivo vendas.csv com 10 linhas e as colunas abaixo.',
          },
          {
            type: 'code',
            language: 'text',
            title: 'vendas.csv (cabeçalho)',
            code: 'data,produto,categoria,valor',
          },
          { type: 'heading', text: 'Requisitos' },
          {
            type: 'list',
            items: [
              'Ler o arquivo com o módulo csv (ou pandas, se preferir).',
              'Imprimir, por categoria: quantidade de vendas e valor total.',
              'Ordenar do maior total para o menor.',
            ],
          },
          { type: 'heading', text: 'Formato de saída sugerido' },
          {
            type: 'code',
            language: 'text',
            title: 'output',
            code: 'eletrônicos   3 vendas   R$ 4.250,00\nlivros        4 vendas   R$   310,50\nmercado       3 vendas   R$   128,90',
          },
        ],
      },
      {
        title: '3. Classe',
        blocks: [
          { type: 'paragraph', text: 'Implemente uma conta bancária simples.' },
          {
            type: 'code',
            language: 'python',
            code: 'class SaldoInsuficienteError(Exception):\n    ...\n\n\nclass ContaBancaria:\n    def __init__(self, titular: str, saldo: float = 0):\n        ...',
          },
          { type: 'heading', text: 'Requisitos' },
          {
            type: 'list',
            items: [
              'depositar(valor): valor <= 0 levanta ValueError.',
              'sacar(valor): saldo insuficiente levanta SaldoInsuficienteError.',
              'extrato(): lista das operações feitas (tipo e valor).',
              '__repr__ mostrando titular e saldo.',
            ],
          },
        ],
      },
      {
        title: '4. Comprehensions',
        blocks: [
          { type: 'paragraph', text: 'Use comprehensions a partir desta lista:' },
          {
            type: 'code',
            language: 'python',
            code: 'pessoas = [\n    {"nome": "Ana", "idade": 17, "cidade": "Recife"},\n    {"nome": "Bruno", "idade": 22, "cidade": "Natal"},\n    {"nome": "Carla", "idade": 30, "cidade": "Recife"},\n]',
          },
          { type: 'heading', text: 'Gere' },
          {
            type: 'list',
            ordered: true,
            items: [
              'Os nomes em MAIÚSCULAS de quem tem 18 anos ou mais.',
              'Um dict cidade → lista de nomes.',
              'Um set com as cidades.',
            ],
          },
        ],
      },
      {
        title: '5. Caça aos bugs',
        blocks: [
          {
            type: 'paragraph',
            text: 'O script abaixo tem 3 bugs. Corrija e explique cada um em um comentário. As docstrings descrevem o comportamento correto.',
          },
          {
            type: 'code',
            language: 'python',
            code: 'def media(notas):\n    """Média simples das notas."""\n    return sum(notas) / len(notas) - 1\n\n\ndef media_da_turma(alunos):\n    """Média das médias de cada aluno."""\n    total = 0\n    for aluno in alunos:\n        total += aluno["notas"]\n    return total / len(alunos)\n\n\ndef aprovados(alunos, corte=7):\n    """Nomes de quem tem média maior ou igual ao corte."""\n    return [a["nome"] for a in alunos if media(a["notas"]) > corte]\n\n\nalunos = [\n    {"nome": "Ana", "notas": [7, 7, 7]},\n    {"nome": "Bia", "notas": [10, 8, 6]},\n]',
          },
          { type: 'heading', text: 'Resultado esperado depois de corrigir' },
          {
            type: 'code',
            language: 'python',
            title: 'output',
            code: 'media_da_turma(alunos) == 7.5\naprovados(alunos) == ["Ana", "Bia"]',
          },
        ],
      },
    ],
  },
  evaluationRubric: {
    blocks: [
      {
        type: 'list',
        items: [
          '1. Estatísticas: valores corretos para o exemplo, empate na moda resolvido, ValueError na lista vazia.',
          '2. CSV: lê sem quebrar, agrega por categoria e ordena pelo total (decrescente).',
          '3. Classe: as duas exceções certas, extrato registra depósitos e saques, __repr__ legível.',
          '4. Comprehensions: as três estruturas geradas só com comprehensions.',
          '5. Bugs: os 3 encontrados, corrigidos e explicados.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Conta como feito sozinho se você precisou só da documentação. Se precisou de solução pronta ou de IA, não conta.',
      },
    ],
  },
  solutionContent: {
    sections: [
      {
        title: 'Caça aos bugs: correção',
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'def media(notas):\n    """Média simples das notas."""\n    return sum(notas) / len(notas)  # bug 1: subtraía 1 do resultado\n\n\ndef media_da_turma(alunos):\n    """Média das médias de cada aluno."""\n    total = 0\n    for aluno in alunos:\n        total += media(aluno["notas"])  # bug 2: somava a LISTA de notas\n    return total / len(alunos)\n\n\ndef aprovados(alunos, corte=7):\n    """Nomes de quem tem média maior ou igual ao corte."""\n    return [a["nome"] for a in alunos if media(a["notas"]) >= corte]  # bug 3: > deixava a média 7 de fora',
          },
        ],
      },
      {
        title: 'Estatísticas: uma solução possível',
        blocks: [
          {
            type: 'code',
            language: 'python',
            code: 'from collections import Counter\n\n\ndef estatisticas(numeros: list[float]) -> dict:\n    if not numeros:\n        raise ValueError("A lista de números está vazia.")\n    ordenados = sorted(numeros)\n    meio = len(ordenados) // 2\n    if len(ordenados) % 2:\n        mediana = ordenados[meio]\n    else:\n        mediana = (ordenados[meio - 1] + ordenados[meio]) / 2\n    contagem = Counter(numeros)\n    maior = max(contagem.values())\n    moda = min(n for n, c in contagem.items() if c == maior)\n    return {"media": sum(numeros) / len(numeros), "mediana": mediana, "moda": moda}',
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- SQL
const SQL_ENTRY: CareerQuestContent = {
  promptContent: {
    sections: [
      entryTestInstructions(
        'DB-02',
        'Critério: 6, 7 ou 8 queries corretas → PASSOU. 5 ou menos → FALHOU (DB-02 fica em L1). Query que roda mas devolve o resultado errado conta como errada. Tempo: 60 minutos.',
      ),
      {
        title: 'Preparação (não conta no tempo)',
        blocks: [
          {
            type: 'list',
            ordered: true,
            items: [
              'Instale o PostgreSQL.',
              'Restaure o banco de exemplo dvdrental (tutorial do postgresqltutorial.com).',
              'Responda em sql/entrada.sql: uma query por item, com um comentário curto explicando a lógica.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Sem Postgres à mão? Cada query também tem uma versão executável aqui no app, num banco reduzido (SQLite) com as mesmas tabelas do dvdrental. Os números são menores, mas a lógica é a mesma.',
          },
          {
            type: 'code',
            language: 'bash',
            code: 'createdb dvdrental\npg_restore -U postgres -d dvdrental dvdrental.tar',
          },
        ],
      },
      {
        title: 'Queries 1–4: filtros, JOINs e agregação',
        blocks: [
          {
            type: 'list',
            ordered: true,
            items: [
              "Filmes com rating 'PG-13' e duração (length) maior que 120 min, ordenados por título.",
              'Nome e sobrenome de cada cliente com a cidade onde mora (customer → address → city).',
              'Quantidade de filmes por categoria, da maior para a menor (film_category + category).',
              'Só as categorias com mais de 60 filmes (use HAVING).',
            ],
          },
        ],
      },
      {
        title: 'Queries 5–7: subquery, ranking e window function',
        blocks: [
          {
            type: 'list',
            ordered: true,
            items: [
              'Clientes cujo total pago é maior que a média do total pago por cliente (subquery ou CTE sobre payment).',
              'Os 5 filmes mais alugados (rental → inventory → film).',
              'Para cada pagamento: cliente, data, valor e o TOTAL ACUMULADO do cliente ao longo do tempo.',
            ],
          },
          { type: 'callout', tone: 'tip', text: 'A 7 pede uma window function:' },
          {
            type: 'code',
            language: 'sql',
            code: 'SUM(...) OVER (PARTITION BY ... ORDER BY ...)',
          },
        ],
      },
      {
        title: '8. O que está errado?',
        blocks: [
          {
            type: 'paragraph',
            text: 'A query abaixo deveria listar TODOS os clientes com a quantidade de aluguéis desde 01/08/2005 (zero para quem não alugou). Explique os 2 problemas e corrija.',
          },
          {
            type: 'code',
            language: 'sql',
            code: "SELECT c.first_name, COUNT(r.rental_id)\nFROM customer c\nLEFT JOIN rental r ON r.customer_id = c.customer_id\nWHERE r.rental_date >= '2005-08-01';",
          },
        ],
      },
    ],
  },
  evaluationRubric: {
    blocks: [
      {
        type: 'list',
        items: [
          'Cada query vale 1 ponto se devolve o resultado certo; comentário explicando a lógica é obrigatório.',
          '1–4: filtros, JOIN de 3 tabelas e HAVING corretos.',
          '5: compara com a média POR CLIENTE (não a média de todos os pagamentos).',
          '6: agrega por filme (não por cópia do inventário).',
          '7: total acumulado reinicia para cada cliente e segue a data.',
          '8: identifica os DOIS problemas (falta de GROUP BY e o WHERE que anula o LEFT JOIN).',
        ],
      },
    ],
  },
  solutionContent: {
    sections: [
      {
        title: 'Queries 1–4',
        blocks: [
          {
            type: 'code',
            language: 'sql',
            code: "-- 1\nSELECT title, length\nFROM film\nWHERE rating = 'PG-13' AND length > 120\nORDER BY title;\n\n-- 2\nSELECT c.first_name, c.last_name, ci.city\nFROM customer c\nJOIN address a ON a.address_id = c.address_id\nJOIN city ci ON ci.city_id = a.city_id;\n\n-- 3\nSELECT cat.name, COUNT(*) AS filmes\nFROM film_category fc\nJOIN category cat ON cat.category_id = fc.category_id\nGROUP BY cat.name\nORDER BY filmes DESC;\n\n-- 4\nSELECT cat.name, COUNT(*) AS filmes\nFROM film_category fc\nJOIN category cat ON cat.category_id = fc.category_id\nGROUP BY cat.name\nHAVING COUNT(*) > 60;",
          },
        ],
      },
      {
        title: 'Queries 5–7',
        blocks: [
          {
            type: 'code',
            language: 'sql',
            code: '-- 5\nWITH totais AS (\n  SELECT customer_id, SUM(amount) AS total\n  FROM payment\n  GROUP BY customer_id\n)\nSELECT customer_id, total\nFROM totais\nWHERE total > (SELECT AVG(total) FROM totais);\n\n-- 6\nSELECT f.title, COUNT(*) AS alugueis\nFROM rental r\nJOIN inventory i ON i.inventory_id = r.inventory_id\nJOIN film f ON f.film_id = i.film_id\nGROUP BY f.film_id, f.title\nORDER BY alugueis DESC\nLIMIT 5;\n\n-- 7\nSELECT customer_id, payment_date, amount,\n       SUM(amount) OVER (\n         PARTITION BY customer_id\n         ORDER BY payment_date\n       ) AS total_acumulado\nFROM payment;',
          },
        ],
      },
      {
        title: '8: correção',
        blocks: [
          {
            type: 'list',
            items: [
              'Falta GROUP BY: há uma agregação junto de uma coluna não agregada.',
              'O filtro no WHERE descarta os clientes sem aluguel (r.rental_date fica NULL), transformando o LEFT JOIN em INNER JOIN. O filtro precisa ir para o ON.',
            ],
          },
          {
            type: 'code',
            language: 'sql',
            code: "SELECT c.customer_id, c.first_name, COUNT(r.rental_id) AS alugueis\nFROM customer c\nLEFT JOIN rental r\n  ON r.customer_id = c.customer_id\n AND r.rental_date >= '2005-08-01'\nGROUP BY c.customer_id, c.first_name;",
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- GIT & LINUX
const GIT_LINUX_ENTRY: CareerQuestContent = {
  promptContent: {
    sections: [
      entryTestInstructions(
        'SE-01 (Git) e LX-01 (Linux)',
        'Critério: Git, itens 1–5: 4 ou 5 feitos SOZINHO → teste PASSOU em SE-01 L2. Linux, itens 6–11: 5 ou 6 SOZINHO → teste PASSOU em LX-01 L2. Tempo: 60 minutos, tudo no terminal (Git Bash ou WSL). Anotações em git-linux/entrada.md.',
      ),
      {
        title: 'Git (itens 1–5)',
        blocks: [
          {
            type: 'list',
            ordered: true,
            items: [
              'Crie um repositório novo e faça 3 commits com mensagens claras.',
              'Crie a branch feature, altere a MESMA linha de um arquivo na main e na feature, faça o merge e resolva o conflito.',
              'Desfaça o último commit mantendo as alterações nos arquivos.',
              'Apague um arquivo, faça commit e depois recupere a versão dele de antes de ser apagado.',
              'Mostre o histórico em forma de grafo e explique o que cada linha representa.',
            ],
          },
        ],
      },
      {
        title: 'Linux (itens 6–11)',
        blocks: [
          {
            type: 'list',
            items: [
              '6. Liste todos os arquivos .py de uma pasta e de todas as subpastas.',
              '7. Encontre os arquivos que contêm a palavra TODO.',
              '8. Conte quantas linhas há em todos os arquivos .csv de uma pasta.',
              '9. Com pipes, mostre os 5 maiores arquivos de uma pasta.',
              '10. Crie um script .sh, torne-o executável e explique o que significa rwxr-xr-x.',
              '11. Defina uma variável de ambiente no terminal e leia o valor dela de dentro de um script Python.',
            ],
          },
        ],
      },
    ],
  },
  evaluationRubric: {
    blocks: [
      {
        type: 'list',
        items: [
          'Conta como SOZINHO quando você não precisou consultar nada.',
          'CONSULTEI A DOC conta como meio ponto para a sua leitura, mas não para o critério de aprovação.',
          'Item 5 e item 10 exigem a explicação, não só o comando.',
        ],
      },
    ],
  },
  solutionContent: {
    sections: [
      {
        title: 'Git',
        blocks: [
          {
            type: 'code',
            language: 'bash',
            code: '# 2: conflito\ngit switch -c feature   # edite a linha, commit\ngit switch main          # edite a mesma linha, commit\ngit merge feature        # resolva o arquivo, depois:\ngit add arquivo && git commit\n\n# 3: desfazer o último commit mantendo os arquivos\ngit reset --soft HEAD~1\n\n# 4: recuperar arquivo apagado\ngit log --oneline -- arquivo.txt\ngit restore --source=<commit_antes_de_apagar> arquivo.txt\n\n# 5: grafo\ngit log --oneline --graph --all',
          },
        ],
      },
      {
        title: 'Linux',
        blocks: [
          {
            type: 'code',
            language: 'bash',
            code: '# 6\nfind . -name "*.py"\n\n# 7\ngrep -rl "TODO" .\n\n# 8\ncat *.csv | wc -l\n\n# 9\nls -lS | head -n 6\n\n# 10\nchmod +x script.sh   # rwx dono, r-x grupo, r-x outros\n\n# 11\nexport MINHA_VAR=ola\npython -c "import os; print(os.environ[\'MINHA_VAR\'])"',
          },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------- SELF-GRADING
const PYTHON_GRADING: CareerQuestGrading = {
  groups: [
    {
      skillId: 'PY-02',
      level: 2,
      label: 'Python — PY-02 L2 (passa com 4 de 5; documentação permitida)',
      passMin: 4,
      countsDoc: true,
      items: [
        {
          id: 'stats',
          label: '1. Estatísticas',
          criteria: [
            'estatisticas([3, 1, 2, 2, 5]) devolve media 2.6, mediana 2 e moda 2',
            'Empate na moda devolve a menor',
            'Lista vazia levanta ValueError',
          ],
        },
        {
          id: 'csv',
          label: '2. CSV',
          criteria: [
            'Lê o vendas.csv sem quebrar',
            'Mostra quantidade e total por categoria',
            'Ordenado do maior total para o menor',
          ],
        },
        {
          id: 'class',
          label: '3. Classe',
          criteria: [
            'depositar com valor <= 0 levanta ValueError',
            'sacar sem saldo levanta SaldoInsuficienteError (criada por você)',
            'extrato registra depósitos e saques; __repr__ legível',
          ],
        },
        {
          id: 'comprehensions',
          label: '4. Comprehensions',
          criteria: [
            'Nomes em maiúsculas de quem tem 18+ (só Bruno e Carla)',
            'Dict cidade → lista de nomes',
            'Set de cidades — tudo com comprehensions',
          ],
        },
        {
          id: 'bugs',
          label: '5. Caça aos bugs',
          criteria: [
            'Os 3 bugs encontrados e corrigidos',
            'media_da_turma(alunos) == 7.5 e aprovados(alunos) == ["Ana", "Bia"]',
            'Um comentário explicando cada bug',
          ],
        },
      ],
    },
  ],
};

const SQL_GRADING: CareerQuestGrading = {
  groups: [
    {
      skillId: 'DB-02',
      level: 2,
      label: 'SQL — DB-02 L2 (passa com 6 de 8; documentação permitida)',
      passMin: 6,
      countsDoc: true,
      items: [
        {
          id: 'q1',
          label: '1. Filmes PG-13 > 120 min',
          criteria: ['Filtro duplo correto', 'Ordenado por título'],
        },
        {
          id: 'q2',
          label: '2. Cliente + cidade',
          criteria: ['JOIN customer → address → city', 'Todos os clientes aparecem'],
        },
        {
          id: 'q3',
          label: '3. Filmes por categoria',
          criteria: ['GROUP BY por categoria', 'Ordenado do maior para o menor'],
        },
        {
          id: 'q4',
          label: '4. Categorias com > 60 filmes',
          criteria: ['Usa HAVING (não WHERE) para o filtro do agregado'],
        },
        {
          id: 'q5',
          label: '5. Acima da média',
          criteria: ['Compara com a média do TOTAL POR CLIENTE', 'Subquery ou CTE'],
        },
        {
          id: 'q6',
          label: '6. Top 5 mais alugados',
          criteria: [
            'Agrupa por filme (não por cópia do inventário)',
            'LIMIT 5 após ordenar',
          ],
        },
        {
          id: 'q7',
          label: '7. Total acumulado',
          criteria: ['Window function SUM() OVER', 'Reinicia por cliente e segue a data'],
        },
        {
          id: 'q8',
          label: '8. O que está errado?',
          criteria: [
            'Aponta a falta de GROUP BY',
            'Aponta que o WHERE anula o LEFT JOIN e move o filtro para o ON',
          ],
        },
      ],
    },
  ],
};

const GIT_LINUX_GRADING: CareerQuestGrading = {
  groups: [
    {
      skillId: 'SE-01',
      level: 2,
      label: 'Git — SE-01 L2 (passa com 4 de 5 feitos SOZINHO)',
      passMin: 4,
      countsDoc: false,
      items: [
        { id: 'g1', label: '1. Repositório e 3 commits', criteria: ['Mensagens claras'] },
        {
          id: 'g2',
          label: '2. Conflito resolvido',
          criteria: ['Merge com conflito resolvido e commitado'],
        },
        {
          id: 'g3',
          label: '3. Desfazer o último commit',
          criteria: ['Alterações mantidas nos arquivos'],
        },
        {
          id: 'g4',
          label: '4. Recuperar arquivo apagado',
          criteria: ['Versão anterior recuperada a partir do histórico'],
        },
        {
          id: 'g5',
          label: '5. Histórico em grafo',
          criteria: ['Explica o que cada linha representa'],
        },
      ],
    },
    {
      skillId: 'LX-01',
      level: 2,
      label: 'Linux — LX-01 L2 (passa com 5 de 6 feitos SOZINHO)',
      passMin: 5,
      countsDoc: false,
      items: [
        {
          id: 'l6',
          label: '6. Listar .py recursivamente',
          criteria: ['Inclui subpastas'],
        },
        {
          id: 'l7',
          label: '7. Arquivos com TODO',
          criteria: ['Busca no conteúdo, não no nome'],
        },
        {
          id: 'l8',
          label: '8. Contar linhas dos .csv',
          criteria: ['Total de linhas correto'],
        },
        {
          id: 'l9',
          label: '9. 5 maiores arquivos com pipes',
          criteria: ['Usa pipe e ordena por tamanho'],
        },
        {
          id: 'l10',
          label: '10. Script executável',
          criteria: ['chmod correto', 'Explica rwxr-xr-x'],
        },
        {
          id: 'l11',
          label: '11. Variável de ambiente no Python',
          criteria: ['Valor lido via os.environ'],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------- RUNNABLE EXERCISES
/** Section title → runnable exercises appended to it (see career-quest.challenges). */
const CHALLENGES_BY_SECTION = new Map<string, string[]>([
  ['1. Estatísticas', ['cq-py-1']],
  ['2. CSV', ['cq-py-2']],
  ['3. Classe', ['cq-py-3']],
  ['4. Comprehensions', ['cq-py-4']],
  ['5. Caça aos bugs', ['cq-py-5']],
  [
    'Queries 1–4: filtros, JOINs e agregação',
    ['cq-sql-1', 'cq-sql-2', 'cq-sql-3', 'cq-sql-4'],
  ],
  [
    'Queries 5–7: subquery, ranking e window function',
    ['cq-sql-5', 'cq-sql-6', 'cq-sql-7'],
  ],
  ['8. O que está errado?', ['cq-sql-8']],
]);

const withChallenges = (content: CareerQuestContent): CareerQuestContent => ({
  ...content,
  promptContent: {
    ...content.promptContent,
    sections: content.promptContent.sections?.map((section) => {
      const challenges = (CHALLENGES_BY_SECTION.get(section.title) ?? [])
        .map((id) => CAREER_CHALLENGE_BY_ID.get(id))
        .filter((challenge) => !!challenge);
      if (!challenges.length) return section;
      return {
        ...section,
        blocks: [
          ...section.blocks,
          { type: 'heading', text: 'Resolver aqui no app' },
          ...challenges.map(
            (challenge): CareerContentBlock => ({ type: 'challenge', challenge }),
          ),
        ],
      };
    }),
  },
});

export const CAREER_QUEST_CONTENT = new Map<string, CareerQuestContent>([
  ['q-w1-python-entry', { ...withChallenges(PYTHON_ENTRY), grading: PYTHON_GRADING }],
  ['q-w1-sql-entry', { ...withChallenges(SQL_ENTRY), grading: SQL_GRADING }],
  ['q-w1-git-linux-entry', { ...GIT_LINUX_ENTRY, grading: GIT_LINUX_GRADING }],
]);
