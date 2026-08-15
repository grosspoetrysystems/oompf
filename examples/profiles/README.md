# Seed profiles

A small, deliberately-differentiated set of shareable OMP `config.yml` profiles
(GPS-146). Each describes an **economics and execution strategy**, not a project —
the axis people actually compare when trading configs. They are validated by
`@oompf/core` (structurally valid, no secrets, legible `oompf:` block) and are the
input to seeding the index (GPS-106 / GPS-115). They are examples, not anyone's
private setup; adjust model names to what you actually run.

| Profile | Kind | Strategy | Default | Planning | Review | Background | Thinking | Advisor | Fallbacks |
|---|---|---|---|---|---|---|---|---|---|
| `subscription` | general | Flat, predictable cost on one subscription | Sonnet | Opus | — | Haiku | medium | off | — |
| `hybrid` | general | Best general-purpose mix | Sonnet (sub) | GPT-5.6 (API) | Gemini (independent) | local | medium | on | plan, default |
| `local` | local | Privacy / zero marginal cost, cloud only when it matters | local (Ollama) | GPT-5.6 | Opus | local | low | off | — |
| `max-quality` | general | No compromises, cost is not the constraint | Opus | GPT-5.6 | Gemini + security pass | Sonnet | xhigh | on | default |
| `budget` | budget | Maximize throughput per dollar | DeepSeek Flash | Kimi | GLM | local | low | off | — |
| `research` | research | Understand deeply over shipping fast | GPT-5.6 | Opus | — | Haiku | high | on | — |
| `claude-only` | general | Single provider (Anthropic), differentiated by task | Sonnet | Opus | — | Haiku | medium | on | — |
| `codex-only` | general | Single provider (OpenAI Codex), differentiated by task | gpt-5.6-luna | luna:max | — | gpt-5.5 | medium | on | — |

The axes that differentiate them: model-per-task, local vs hosted execution,
cost/speed tier, `defaultThinkingLevel`, `advisor` on/off, and `retry.fallbackChains`.

`claude-only` and `codex-only` are deliberately **single-provider**: the unit is
the task, not the provider, so a profile whose tasks all resolve within one
provider is first-class — not a degraded multi-provider one. This is the
conformance principle behind the interoperability work (GPS-154 / GPS-156).

Design rationale: the [Pi-native profiles design](https://linear.app/grosspoetrysystems/document/pi-native-profiles-bringing-omp-profiles-to-upstream-pi-no-fork-0723354546a4).
