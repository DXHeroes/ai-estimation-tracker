# AI Estimation Tracker

Plugin pro Claude Code a Cursor. Měří jak přesně AI odhaduje čas implementace.

**Zero dependencies.** Jen Node.js. Funguje na Windows, macOS, Linux.

## Instalace

### Claude Code

```bash
# 1. Přidej marketplace
/plugin marketplace add DXHeroes/ai-estimation-tracker

# 2. Nainstaluj plugin
/plugin install estimation-tracker@ai-estimation-tracker@latest
```

### Cursor

```bash
# Přes marketplace
/add-plugin z URL: github.com/DXHeroes/ai-estimation-tracker

# Nebo ručně — Cursor podporuje Claude Code hooks formát:
# Zkopíruj plugins/estimation-tracker/ do ~/.cursor/plugins/
```

Po instalaci restartuj Claude Code / Cursor.

## Jak to funguje

```
1. Zadáš prompt
   └─▶ Hook uloží timestamp startu

2. AI vidí Skill → napíše <!-- ESTIMATE: 15 --> na první řádek

3. AI vrátí odpověď
   └─▶ Hook:
       • spočítá skutečný čas (teď - start)
       • parsuje odhad z odpovědi
       • detekuje model a tool
       • pošle do OTEL collectoru
       • uloží lokálně do JSON + log
```

### Proč Skill místo additionalContext?

`additionalContext` v hook return value funguje **jen v Claude Code**.
Skill (SKILL.md) funguje v obou — agent si ho načte sám, když je relevantní.
Instrukce "vždy odhadni čas" tak funguje univerzálně.

## Co se trackuje

| Atribut | Popis |
|---------|-------|
| `ai.model` | Model (claude-sonnet-4-..., gpt-4o, ...) |
| `ai.tool` | Nástroj (claude-code, cursor) |
| `task.estimated_minutes` | AI odhad v lidských minutách |
| `task.actual_minutes` | Skutečný wall-clock čas |
| `task.estimation_accuracy` | Poměr estimate/actual (1.0 = perfektní) |
| `task.loc_added` / `loc_removed` | Řádky kódu (0 bez gitu) |
| `task.prompt` | Prvních 200 znaků promptu |

Model se detekuje automaticky:
1. Z transkriptu (JSONL) — nejpřesnější
2. Z hook inputu
3. Z env vars (`CLAUDE_MODEL`, `ANTHROPIC_MODEL`)
4. Fallback: `"unknown"`

## Monitoring stack (volitelně)

```bash
# Spusť OTEL Collector + Prometheus + Loki + Grafana
docker compose up -d

# Grafana: http://localhost:3000 (admin/admin)
```

Nastav OTEL endpoint:

```bash
# V Claude Code — env vars v settings.json nebo .claude/settings.json
"env": {
  "AI_TRACKER_OTEL_ENDPOINT": "http://localhost:4318"
}

# Nebo env var přímo
export AI_TRACKER_OTEL_ENDPOINT="https://otel.tvoje-domena.com"
```

Bez OTEL collectoru hook tiše selže — data se ukládají lokálně vždy.

## CLI statistiky

```bash
node stats.js        # posledních 30 dní
node stats.js 7      # posledních 7 dní
```

```
═══════════════════════════════════════════════
  AI Estimation Accuracy Report (last 30 days)
═══════════════════════════════════════════════

  Tasks tracked:        42
  Tasks completed:      38
  With AI estimates:    35

  ┌─────────────────────────────────────────┐
  │ Avg AI Estimate:     8.3m
  │ Avg Actual Time:     12.1m
  │ Accuracy Ratio:      0.69x  (1.0 = perfect)
  │ Total LOC Changed:   2847
  ├─────────────────────────────────────────┤
  │ Underestimates:      24  (AI too optimistic)
  │ Overestimates:       6   (AI too pessimistic)
  │ Accurate (±10%):     5
  └─────────────────────────────────────────┘

  Per-model breakdown:
  ─────────────────────────────────────────────────────────────────────
  Model                              Tasks  Avg Est  Avg Actual  Accuracy
  ─────────────────────────────────────────────────────────────────────
  claude-sonnet-4-20250514              18     6.2m       9.8m      0.63x
  claude-opus-4-20250603                12    11.5m      14.2m      0.81x
  gpt-4o                                5     7.8m      13.1m      0.60x
```

## Struktura repa

```
ai-estimation-tracker/                ← marketplace repo
├── .claude-plugin/
│   └── marketplace.json              ← marketplace manifest
├── plugins/
│   └── estimation-tracker/           ← plugin
│       ├── .claude-plugin/
│       │   └── plugin.json           ← plugin manifest
│       ├── skills/
│       │   └── estimation/
│       │       └── SKILL.md          ← "vždy odhadni čas"
│       ├── hooks/
│       │   ├── hooks.json            ← hook config
│       │   ├── on_prompt_submit.js   ← start timer
│       │   └── on_stop.js            ← stop + compute + OTEL
│       └── README.md
├── otel-config/                      ← monitoring stack config
│   ├── otel-collector-config.yaml
│   ├── prometheus.yaml
│   └── grafana-datasources.yaml
├── docker-compose.yaml               ← monitoring stack
├── stats.js                          ← CLI report
└── README.md
```

## Deploy na Coolify

1. Vytvoř Docker Compose service z `docker-compose.yaml`
2. Nastav `GRAFANA_PASSWORD`
3. Deploy
4. Nastav `AI_TRACKER_OTEL_ENDPOINT` na URL tvého collectoru

## Troubleshooting

**Plugin se nenainstaloval:**
```bash
/plugin validate ./plugins/estimation-tracker
```

**Hooky nefungují:**
```bash
claude --debug     # Claude Code
# Cursor: Check Output panel → Hooks
```

**Chybí odhad:**
AI občas Skill ignoruje. Přidej do `CLAUDE.md` v projektu:
```markdown
## Estimation Rule
Always write <!-- ESTIMATE: X --> on the very first line of every response.
```

**OTEL data nepřichází:**
```bash
docker compose logs otel-collector
curl -v http://localhost:4318/v1/logs
```

## Licence

MIT
