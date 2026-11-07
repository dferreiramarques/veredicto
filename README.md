# Veredicto

Hipóteses com métrica, sessões de teste e a decisão **perseverar / ajustar / matar** no fim de cada incremento — a etapa *Validar* do método [monco](https://monco.io).

- **Hipótese**: problema · utilizador · aposta · métrica (o que se mede + alvo). Crítica ou não.
- **Sessão**: data · tipo · sinal observado · medido · veredicto (*sustentada / refutada / insuficiente*) · acção com destino. `insuficiente` é veredicto real: a hipótese continua por testar.
- **Decisão**: a app sugere a partir das hipóteses críticas; tu decides, com o porquê.
- **Exportar**: JSON (os dados) e Markdown (o relatório para a documentação). Importa também o `validacoes.yaml` do Veredicto v0.

Os dados ficam no teu browser. Nada é enviado para um servidor.

```bash
npm install && npm test && npm start
```

MIT © David Marques / monco.io
