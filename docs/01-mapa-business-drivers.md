# Mapa do Business Drivers [3.0 pontos]

Os seguintes são os três direcionadores mapeados com risco, métrica e critério de verificação:

| Direcionador | Risco principal | Métricas aferidas | Critério de aceitação |
| --- | --- | --- | --- |
| Confiabilidade do Fluxo Assíncrono de Upload | Upload aceito sem rastreabilidade confiável do processo | taxa de sucesso de upload, presença de `processos[0].id`, latência p95 | sucesso >= 99% (quando `ASSERT_SLO=true`) |
| Confiabilidade de Consulta por Polling de Status | Polling infinito, timeout sem controle, falta de retry para erro transitorio | taxa de consultas sem erro, taxa de timeout, retries executados | polling encerra em `201`, `500`, `404` ou timeout controlado |
| Performance e estabilidade sob alta carga | aumento de latência, erro 5xx/429, degradação sob concorrência | p95, taxa de erro, throughput, janela por minuto | erro < 5%, p95 < 2000ms, sem degradação abrupta |

### Evidências no código

- Driver 1: `tests/integration/driver1-upload-reliability.spec.js`
- Driver 2: `tests/unit/polling-status.spec.js` e `tests/integration/driver2-polling-reliability.spec.js`
- Driver 3: `tests/load/driver3-high-load.js`
