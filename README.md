# ASIS Tax Tech - Qualidade por Business Drivers (Node.js)

Projeto de afericao de qualidade da API ASIS com 3 drivers de negocio:

1. Confiabilidade do fluxo assincrono de upload
2. Confiabilidade de consulta por polling de status
3. Performance e estabilidade sob alta carga

## Resposta objetiva ao enunciado

1. Mapa do Business Drivers [3.0 pontos]: [docs/01-mapa-business-drivers.md](docs/01-mapa-business-drivers.md)
2. Estrategia e massa de testes [4.0 pontos]: [docs/02-estrategia-massa-testes.md](docs/02-estrategia-massa-testes.md)
3. Codificacao como documentacao de testes [3.0 pontos]: [docs/03-codificacao-como-documentacao.md](docs/03-codificacao-como-documentacao.md)

## Stack e premissas

- Node.js 20+
- Testes: Mocha + Chai + Mochawesome
- API alvo: ambiente STG da ASIS
- Credenciais por `.env` (nao versionado)

## Configuracao

1. Instale dependencias:

```bash
npm ci
```

2. Crie `.env` a partir de `.env.example` e preencha:

- `ASIS_APP_KEY`
- `ASIS_ACCOUNT_KEY`

3. Fixture principal:

- `tests/fixtures/sped-fiscal.txt`

## Execucao

```bash
# Unitario (servico de polling e retry)
npm run test:unit

# Integracao real (upload + polling)
npm run test:integration

# Todos os testes unitarios + integracao
npm run test:all

# Carga real agressiva: 200 VUs por 5 minutos (default)
npm run test:load
```

## Relatorios

Arquivos gerados em `reports/`:

- `unit-report.html` e `unit-report.json`
- `integration-report.html` e `integration-report.json`
- `driver1-upload-summary.json`
- `driver2-polling-summary.json`
- `load-metrics.json`
- `load-summary.md`

## Resultado da ultima execucao local (2026-02-27)

- Unitario: 3/3 passando
- Integracao: 6/6 passando
- Driver 1 (burst): sucesso 100%, p95 upload 1057ms
- Driver 2 (polling): timeout controlado observado com status 100
- Driver 3 (200 VUs / 5 min): erro 95.39% (criterio de estabilidade falhou)

## CI/CD minima

Workflow em `.github/workflows/ci.yml`:

- `npm ci`
- `npm run test:unit`
- `npm run test:integration`
- Upload de artefatos de `reports/`
- Job manual (`workflow_dispatch`) para `npm run test:load`
