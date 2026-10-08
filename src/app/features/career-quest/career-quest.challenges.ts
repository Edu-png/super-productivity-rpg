import { CodeLabChallenge } from '../code-lab/code-lab.model';

/**
 * Runnable versions of the Python and SQL entry-test exercises. Expected
 * outputs were produced by running each reference solution in the same
 * runtimes the app uses (Pyodide / sql.js), so they match byte for byte.
 * The SQL ones run on a small SQLite copy of the dvdrental schema.
 */
const DVD_SETUP =
  "CREATE TABLE category (category_id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE film (film_id INTEGER PRIMARY KEY, title TEXT, rating TEXT, length INTEGER);\nCREATE TABLE film_category (film_id INTEGER, category_id INTEGER);\nCREATE TABLE city (city_id INTEGER PRIMARY KEY, city TEXT);\nCREATE TABLE address (address_id INTEGER PRIMARY KEY, city_id INTEGER);\nCREATE TABLE customer (customer_id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, address_id INTEGER);\nCREATE TABLE inventory (inventory_id INTEGER PRIMARY KEY, film_id INTEGER);\nCREATE TABLE rental (rental_id INTEGER PRIMARY KEY, rental_date TEXT, inventory_id INTEGER, customer_id INTEGER);\nCREATE TABLE payment (payment_id INTEGER PRIMARY KEY, customer_id INTEGER, rental_id INTEGER, amount REAL, payment_date TEXT);\nINSERT INTO category VALUES (1, 'Action'), (2, 'Comedy'), (3, 'Drama'), (4, 'Horror');\nINSERT INTO film VALUES (1, 'Ace Goldfinger', 'PG-13', 128), (2, 'Airport Pollock', 'R', 54), (3, 'Bang Kwai', 'PG-13', 147), (4, 'Chamber Italian', 'NC-17', 117), (5, 'Dragon Squad', 'PG-13', 170), (6, 'Bride Intrigue', 'PG-13', 56), (7, 'Clue Grail', 'PG', 70), (8, 'Gold River', 'PG-13', 121), (9, 'Heaven Freedom', 'G', 48), (10, 'Alien Center', 'PG-13', 46), (11, 'Breaking Home', 'PG-13', 169), (12, 'Zorro Ark', 'R', 50);\nINSERT INTO film_category VALUES (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 2), (7, 2), (8, 2), (9, 2), (10, 3), (11, 3), (12, 4);\nINSERT INTO city VALUES (1, 'Recife'), (2, 'Natal'), (3, 'Salvador');\nINSERT INTO address VALUES (1, 1), (2, 2), (3, 3), (4, 1), (5, 2), (6, 3);\nINSERT INTO customer VALUES (1, 'Ana', 'Lima', 1), (2, 'Bruno', 'Costa', 2), (3, 'Carla', 'Souza', 3), (4, 'Diego', 'Alves', 4), (5, 'Elisa', 'Rocha', 5), (6, 'Felipe', 'Nunes', 6);\nINSERT INTO inventory VALUES (1, 1), (2, 1), (3, 3), (4, 5), (5, 5), (6, 8), (7, 7), (8, 11), (9, 2), (10, 6);\nINSERT INTO rental VALUES (1, '2005-07-02', 4, 1), (2, '2005-07-05', 4, 2), (3, '2005-08-03', 4, 3), (4, '2005-08-04', 5, 4), (5, '2005-08-06', 5, 5), (6, '2005-08-09', 5, 1), (7, '2005-07-08', 1, 2), (8, '2005-07-11', 1, 3), (9, '2005-08-12', 1, 4), (10, '2005-08-14', 2, 5), (11, '2005-07-15', 2, 6), (12, '2005-07-18', 3, 1), (13, '2005-08-19', 3, 2), (14, '2005-08-21', 3, 4), (15, '2005-07-22', 3, 6), (16, '2005-08-23', 6, 3), (17, '2005-08-25', 6, 1), (18, '2005-07-26', 6, 5), (19, '2005-08-27', 8, 2), (20, '2005-07-28', 8, 4), (21, '2005-08-29', 7, 1), (22, '2005-07-30', 9, 3);\nINSERT INTO payment VALUES (1, 1, 1, 2.5, '2005-07-02'), (2, 2, 2, 4.0, '2005-07-05'), (3, 3, 3, 3.5, '2005-08-03'), (4, 4, 4, 1.5, '2005-08-04'), (5, 5, 5, 5.0, '2005-08-06'), (6, 1, 6, 2.0, '2005-08-09'), (7, 2, 7, 2.5, '2005-07-08'), (8, 3, 8, 4.0, '2005-07-11'), (9, 4, 9, 3.5, '2005-08-12'), (10, 5, 10, 1.5, '2005-08-14'), (11, 6, 11, 5.0, '2005-07-15'), (12, 1, 12, 2.0, '2005-07-18'), (13, 2, 13, 2.5, '2005-08-19'), (14, 4, 14, 4.0, '2005-08-21'), (15, 6, 15, 3.5, '2005-07-22'), (16, 3, 16, 1.5, '2005-08-23'), (17, 1, 17, 5.0, '2005-08-25'), (18, 5, 18, 2.0, '2005-07-26'), (19, 2, 19, 2.5, '2005-08-27'), (20, 4, 20, 4.0, '2005-07-28'), (21, 1, 21, 3.5, '2005-08-29'), (22, 3, 22, 1.5, '2005-07-30');";

export const CAREER_CHALLENGES: CodeLabChallenge[] = [
  {
    id: 'cq-sql-1',
    language: 'sql',
    prompt:
      "Liste título e duração (title, length) dos filmes com rating 'PG-13' e duração maior que 120 minutos, em ordem alfabética de título.",
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    ordered: true,
    tests: [
      {
        name: 'Resultado da query',
        expected:
          'Ace Goldfinger | 128\nBang Kwai | 147\nBreaking Home | 169\nDragon Squad | 170\nGold River | 121',
      },
    ],
  },
  {
    id: 'cq-sql-2',
    language: 'sql',
    prompt:
      'Liste nome, sobrenome e cidade de cada cliente (customer → address → city). Colunas: first_name, last_name, city.',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    tests: [
      {
        name: 'Resultado da query',
        expected:
          'Ana | Lima | Recife\nBruno | Costa | Natal\nCarla | Souza | Salvador\nDiego | Alves | Recife\nElisa | Rocha | Natal\nFelipe | Nunes | Salvador',
      },
    ],
  },
  {
    id: 'cq-sql-3',
    language: 'sql',
    prompt:
      'Quantidade de filmes por categoria, da maior para a menor. Colunas: nome da categoria, quantidade.',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    ordered: true,
    tests: [
      {
        name: 'Resultado da query',
        expected: 'Action | 5\nComedy | 4\nDrama | 2\nHorror | 1',
      },
    ],
  },
  {
    id: 'cq-sql-4',
    language: 'sql',
    prompt:
      'Só as categorias com mais de 3 filmes (no banco reduzido; no dvdrental seriam 60). Colunas: nome da categoria, quantidade.',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    tests: [{ name: 'Resultado da query', expected: 'Action | 5\nComedy | 4' }],
  },
  {
    id: 'cq-sql-5',
    language: 'sql',
    prompt:
      'Clientes cujo total pago é maior que a média do total pago POR CLIENTE. Colunas: customer_id, total.',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    tests: [{ name: 'Resultado da query', expected: '1 | 15\n2 | 11.5\n4 | 13' }],
  },
  {
    id: 'cq-sql-6',
    language: 'sql',
    prompt:
      'Os 5 filmes mais alugados, do mais alugado para o menos. Colunas: título, quantidade de aluguéis. Atenção: alguns filmes têm mais de uma cópia no inventário.',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    ordered: true,
    tests: [
      {
        name: 'Resultado da query',
        expected:
          'Dragon Squad | 6\nAce Goldfinger | 5\nBang Kwai | 4\nGold River | 3\nBreaking Home | 2',
      },
    ],
  },
  {
    id: 'cq-sql-7',
    language: 'sql',
    prompt:
      'Para cada pagamento: customer_id, payment_date, amount e o TOTAL ACUMULADO do cliente ao longo do tempo (nessa ordem de colunas).',
    starterCode: '-- sua query aqui\n',
    setup: DVD_SETUP,
    tests: [
      {
        name: 'Resultado da query',
        expected:
          '1 | 2005-07-02 | 2.5 | 2.5\n1 | 2005-07-18 | 2 | 4.5\n1 | 2005-08-09 | 2 | 6.5\n1 | 2005-08-25 | 5 | 11.5\n1 | 2005-08-29 | 3.5 | 15\n2 | 2005-07-05 | 4 | 4\n2 | 2005-07-08 | 2.5 | 6.5\n2 | 2005-08-19 | 2.5 | 9\n2 | 2005-08-27 | 2.5 | 11.5\n3 | 2005-07-11 | 4 | 4\n3 | 2005-07-30 | 1.5 | 5.5\n3 | 2005-08-03 | 3.5 | 9\n3 | 2005-08-23 | 1.5 | 10.5\n4 | 2005-07-28 | 4 | 4\n4 | 2005-08-04 | 1.5 | 5.5\n4 | 2005-08-12 | 3.5 | 9\n4 | 2005-08-21 | 4 | 13\n5 | 2005-07-26 | 2 | 2\n5 | 2005-08-06 | 5 | 7\n5 | 2005-08-14 | 1.5 | 8.5\n6 | 2005-07-15 | 5 | 5\n6 | 2005-07-22 | 3.5 | 8.5',
      },
    ],
  },
  {
    id: 'cq-sql-8',
    language: 'sql',
    prompt:
      'Corrija a query para listar TODOS os clientes com a quantidade de aluguéis desde 2005-08-01 (zero para quem não alugou). Colunas: customer_id, first_name, quantidade.',
    starterCode:
      "SELECT c.customer_id, c.first_name, COUNT(r.rental_id)\nFROM customer c\nLEFT JOIN rental r ON r.customer_id = c.customer_id\nWHERE r.rental_date >= '2005-08-01';",
    setup: DVD_SETUP,
    tests: [
      {
        name: 'Resultado da query',
        expected:
          '1 | Ana | 3\n2 | Bruno | 2\n3 | Carla | 2\n4 | Diego | 3\n5 | Elisa | 2\n6 | Felipe | 0',
      },
    ],
  },
  {
    id: 'cq-py-1',
    language: 'python',
    prompt:
      'Implemente estatisticas(numeros) devolvendo um dict com "media", "mediana" e "moda". Moda com empate: a menor. Lista vazia: levantar ValueError.',
    starterCode: 'def estatisticas(numeros):\n    ...\n',
    tests: [
      {
        name: 'Exemplo do enunciado',
        after:
          "r = estatisticas([3, 1, 2, 2, 5])\nprint(abs(r['media'] - 2.6) < 1e-9, r['mediana'] == 2, r['moda'] == 2)",
        expected: 'True True True',
      },
      {
        name: 'Quantidade par (mediana é a média dos dois do meio)',
        after:
          "r = estatisticas([4, 1, 3, 2])\nprint(abs(r['media'] - 2.5) < 1e-9, r['mediana'] == 2.5, r['moda'] == 1)",
        expected: 'True True True',
      },
      {
        name: 'Empate na moda fica com a menor',
        after: "r = estatisticas([5, 5, 1, 1, 3])\nprint(r['moda'] == 1)",
        expected: 'True',
      },
      {
        name: 'Lista vazia levanta ValueError',
        after:
          "try:\n    estatisticas([])\n    print('não levantou')\nexcept ValueError:\n    print('ValueError')",
        expected: 'ValueError',
      },
    ],
  },
  {
    id: 'cq-py-2',
    language: 'python',
    prompt:
      'O arquivo vendas.csv (colunas data, produto, categoria, valor) já existe aqui. Implemente resumo_vendas(caminho) devolvendo uma lista de tuplas (categoria, quantidade, total), ordenada do maior total para o menor.',
    starterCode: 'import csv\n\n\ndef resumo_vendas(caminho):\n    ...\n',
    setup:
      "open('vendas.csv', 'w', encoding='utf-8').write('data,produto,categoria,valor\\n2024-01-02,Notebook,eletrônicos,3500.00\\n2024-01-03,Romance,livros,45.90\\n2024-01-03,Arroz,mercado,28.50\\n2024-01-04,Mouse,eletrônicos,150.00\\n2024-01-05,HQ,livros,32.00\\n2024-01-05,Café,mercado,22.40\\n2024-01-06,Fone,eletrônicos,600.00\\n2024-01-07,Didático,livros,180.60\\n2024-01-08,Azeite,mercado,78.00\\n2024-01-09,Poesia,livros,52.00\\n')",
    tests: [
      {
        name: 'vendas.csv',
        after:
          "for cat, qtd, total in resumo_vendas('vendas.csv'):\n    print(cat, qtd, round(total, 2))",
        expected: 'eletrônicos 3 4250.0\nlivros 4 310.5\nmercado 3 128.9',
      },
      {
        name: 'Outro arquivo',
        after:
          "open('outro.csv', 'w', encoding='utf-8').write('data,produto,categoria,valor\\n2024-02-01,Lápis,papelaria,3.50\\n2024-02-02,Bola,esporte,90.00\\n2024-02-03,Caderno,papelaria,25.00\\n')\nfor cat, qtd, total in resumo_vendas('outro.csv'):\n    print(cat, qtd, round(total, 2))",
        expected: 'esporte 1 90.0\npapelaria 2 28.5',
        hidden: true,
      },
    ],
  },
  {
    id: 'cq-py-3',
    language: 'python',
    prompt:
      'Implemente SaldoInsuficienteError e ContaBancaria(titular, saldo=0) com o atributo saldo e os métodos depositar(valor), sacar(valor), extrato() e __repr__. depositar com valor <= 0 levanta ValueError; sacar sem saldo levanta SaldoInsuficienteError (e não altera o saldo). extrato() devolve a lista de operações como tuplas ("deposito", valor) ou ("saque", valor).',
    starterCode:
      'class SaldoInsuficienteError(Exception):\n    ...\n\n\nclass ContaBancaria:\n    def __init__(self, titular, saldo=0):\n        ...\n',
    tests: [
      {
        name: 'Depósito e saque',
        after:
          "c = ContaBancaria('Ana', 100)\nc.depositar(50)\nc.sacar(30)\nprint(c.saldo)",
        expected: '120',
      },
      {
        name: 'Depósito inválido levanta ValueError',
        after:
          "c = ContaBancaria('Ana')\ntry:\n    c.depositar(0)\n    print('não levantou')\nexcept ValueError:\n    print('ValueError')",
        expected: 'ValueError',
      },
      {
        name: 'Saque sem saldo',
        after:
          "c = ContaBancaria('Ana', 10)\ntry:\n    c.sacar(50)\n    print('não levantou')\nexcept SaldoInsuficienteError:\n    print('SaldoInsuficienteError', c.saldo)",
        expected: 'SaldoInsuficienteError 10',
      },
      {
        name: 'Extrato',
        after:
          "c = ContaBancaria('Ana', 100)\nc.depositar(50)\nc.sacar(30)\nprint(c.extrato())",
        expected: "[('deposito', 50), ('saque', 30)]",
      },
      {
        name: '__repr__ mostra titular e saldo',
        after:
          "c = ContaBancaria('Ana', 120)\nr = repr(c)\nprint('Ana' in r and '120' in r)",
        expected: 'True',
      },
    ],
  },
  {
    id: 'cq-py-4',
    language: 'python',
    prompt:
      'Com a lista pessoas (já definida), implemente usando comprehensions: maiores(pessoas) → nomes em MAIÚSCULAS de quem tem 18 anos ou mais; por_cidade(pessoas) → dict cidade → lista de nomes; cidades(pessoas) → set das cidades.',
    starterCode:
      'def maiores(pessoas):\n    ...\n\n\ndef por_cidade(pessoas):\n    ...\n\n\ndef cidades(pessoas):\n    ...\n',
    setup:
      'pessoas = [\n    {"nome": "Ana", "idade": 17, "cidade": "Recife"},\n    {"nome": "Bruno", "idade": 22, "cidade": "Natal"},\n    {"nome": "Carla", "idade": 30, "cidade": "Recife"},\n]',
    tests: [
      {
        name: 'Maiores de idade',
        after: 'print(maiores(pessoas))',
        expected: "['BRUNO', 'CARLA']",
      },
      {
        name: 'Nomes por cidade',
        after:
          "print(por_cidade(pessoas) == {'Recife': ['Ana', 'Carla'], 'Natal': ['Bruno']})",
        expected: 'True',
      },
      {
        name: 'Set de cidades',
        after: "print(cidades(pessoas) == {'Recife', 'Natal'})",
        expected: 'True',
      },
    ],
  },
  {
    id: 'cq-py-5',
    language: 'python',
    prompt:
      'Corrija os 3 bugs (explique cada um num comentário). As docstrings descrevem o comportamento correto.',
    starterCode:
      'def media(notas):\n    """Média simples das notas."""\n    return sum(notas) / len(notas) - 1\n\n\ndef media_da_turma(alunos):\n    """Média das médias de cada aluno."""\n    total = 0\n    for aluno in alunos:\n        total += aluno["notas"]\n    return total / len(alunos)\n\n\ndef aprovados(alunos, corte=7):\n    """Nomes de quem tem média maior ou igual ao corte."""\n    return [a["nome"] for a in alunos if media(a["notas"]) > corte]\n\n\nalunos = [\n    {"nome": "Ana", "notas": [7, 7, 7]},\n    {"nome": "Bia", "notas": [10, 8, 6]},\n]\n',
    tests: [
      { name: 'media()', after: 'print(media([10, 8, 6]))', expected: '8.0' },
      {
        name: 'media_da_turma()',
        after: 'print(media_da_turma(alunos))',
        expected: '7.5',
      },
      {
        name: 'aprovados()',
        after: 'print(aprovados(alunos))',
        expected: "['Ana', 'Bia']",
      },
    ],
  },
];

export const CAREER_CHALLENGE_BY_ID = new Map(
  CAREER_CHALLENGES.map((challenge) => [challenge.id, challenge]),
);
