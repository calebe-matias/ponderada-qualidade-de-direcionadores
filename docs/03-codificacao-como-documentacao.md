# Codificação como documentação de testes [3.0 pontos]

## Pergunta 3:

Codificação como documentação de testes (Como a codificação foi usada como documentação de testes?)

## Resposta:

Os testes foram escritos cada um com ID rastreável, objetivo, cenário e métrica; assim, o próprio código funciona como documentação.

## Mapa de testes por driver

| ID | Driver | Arquivo | Objetivo |
| --- | --- | --- | --- |
| BD1-T01 | Upload assincrono | `tests/integration/driver1-upload-reliability.spec.js` | confirmar upload valido com `processos[0].id` |
| BD1-T02 | Upload assincrono | `tests/integration/driver1-upload-reliability.spec.js` | confirmar erro `401` sem chave |
| BD1-T03 | Upload assincrono | `tests/integration/driver1-upload-reliability.spec.js` | burst concorrente e medicao de p95/sucesso |
| BD2-T01 | Polling | `tests/integration/driver2-polling-reliability.spec.js` | encerrar em estado terminal ou timeout controlado |
| BD2-T02 | Polling | `tests/unit/polling-status.spec.js` | retry/backoff em erro transitorio |
| BD2-T03 | Polling | `tests/unit/polling-status.spec.js` + `tests/integration/driver2-polling-reliability.spec.js` | classificar `404` como `not_found` |
| BD2-T04 | Polling | `tests/integration/driver2-polling-reliability.spec.js` | validar `401` com chave invalida |
| BD3-T01 | Carga | `tests/load/driver3-high-load.js` | executar 200 VUs por 5 min e medir p95/erro/throughput |
| BD3-T02 | Carga | `tests/load/driver3-high-load.js` | verificar estabilidade por janela de 1 minuto |

## Evidências geradas

- Unitário/Integração: `reports/unit-report.html` e `reports/integration-report.html`
- Resumo Driver 1: `reports/driver1-upload-summary.json`
- Resumo Driver 2: `reports/driver2-polling-summary.json`
- Carga: `reports/load-metrics.json` e `reports/load-summary.md`

## Resultado da execução local (2026-02-27)

- Driver 1 (BD1-T03): sucesso `100%` (20/20), p95 upload `1057ms`
- Driver 2 (BD2-T01): polling com timeout controlado, status final observado `100`
- Driver 3 (BD3-T01): 125274 requisicoes, taxa de erro `95.39%`, p95 `372ms`
- Conclusão objetiva de carga: criterio `erro < 5%` falhou no STG nesta execucao

## Conclusão objetiva

O repositório entrega código testável que responde diretamente aos 3 blocos da atividade:

1. mapa dos drivers
2. estrategia e massa
3. codificação como documentação de teste
