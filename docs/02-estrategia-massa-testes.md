# Estratégia e Massa de Testes [4.0 pontos]

Foi adotada estratégia em três camadas:

1. Unitário: valida algoritmo de polling/retry sem dependência externa.
2. Integração: valida contrato real da API STG para upload e consulta de processo.
3. Carga: valida performance e estabilidade em alta concorrência com 200 VUs por 5 minutos.

### Massa de testes

#### Massa funcional

- Arquivo real: `tests/fixtures/sped-fiscal.txt`
- IDs de processo gerados dinamicamente por upload em cada execução

#### Massa negativa

- Ausência de chave no header (`401` esperado)
- Chave inválida (`401` esperado)
- `processId` inexistente (`404` esperado)

### Massa de carga

- Pool semeado por uploads reais (`LOAD_SEED_UPLOADS`, default 10)
- Mix de endpoints:
  - `GET /api/v1/processo/{id}` (70%)
  - `GET /api/v1/resultado/processo/{id}` (30%)

#### Criterios de aprovação

- Upload: sucesso >= 99% (quando modo estrito ativo)
- Polling: >= 95% sem erro de protocolo e encerramento controlado
- Consulta de status p95: < 2s
- Carga: erro HTTP < 5% em 200 VUs por 5 min

#### Risco conhecido de ambiente

No ambiente STG, processos podem permanecer longos periodos em `status=100`.
Tratamento no projeto:

- timeout controlado de polling (sem loop infinito)
- classificação explícita de resultado (`completed`, `failed_terminal`, `not_found`, `timeout`, `error`)
- registro das evidências em `reports/*.json`
