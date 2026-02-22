# AI Cost Analysis — CollabBoard

## Development & Testing Costs

| Category | Provider | Model | Total Tokens | Estimated Cost |
|----------|----------|-------|--------------|----------------|
| AI Agent Dev | Groq | llama-3.3-70b | ~500K | $0.30 |
| AI Agent Dev | Anthropic | claude-sonnet | ~200K | $1.20 |
| AI Agent Dev | OpenAI | gpt-4o-mini | ~100K | $0.05 |
| Code Generation | Anthropic | claude-opus | ~2M | $30.00 |
| **Total Development** | | | **~2.8M** | **~$31.55** |

## Production Cost Projections

### Assumptions
- Average AI commands per user per session: 5
- Average sessions per user per month: 10
- Average tokens per command: ~2,000 input + ~500 output
- Primary model: Groq llama-3.3-70b (cheapest)
- Complex queries fallback: Claude Sonnet (~20% of commands)

### Monthly Cost Estimates

| Metric | 100 Users | 1,000 Users | 10,000 Users | 100,000 Users |
|--------|-----------|-------------|--------------|---------------|
| Total commands/month | 5,000 | 50,000 | 500,000 | 5,000,000 |
| Groq tokens (80%) | 10M | 100M | 1B | 10B |
| Claude tokens (20%) | 2.5M | 25M | 250M | 2.5B |
| Groq cost | $0.60 | $6.00 | $60.00 | $600.00 |
| Claude cost | $9.00 | $90.00 | $900.00 | $9,000.00 |
| **Total monthly** | **$9.60** | **$96.00** | **$960.00** | **$9,600.00** |
| **Cost per user** | **$0.096** | **$0.096** | **$0.096** | **$0.096** |

### Cost Optimization Strategies
1. **Deterministic routing**: ~40% of commands bypass LLM entirely ($0 cost)
2. **Selective tool loading**: Reduces prompt tokens by 30-50%
3. **Model selection**: Simple commands use cheaper models (Haiku/Groq)
4. **Response caching**: 10-minute TTL prevents duplicate API calls
5. **Pre-computed board context**: Eliminates mandatory first tool call

### Infrastructure Costs (Monthly)
| Service | 100 Users | 1,000 Users | 10,000 Users |
|---------|-----------|-------------|--------------|
| Railway (Server) | $5 | $20 | $100 |
| Railway (Python Agent) | $5 | $20 | $100 |
| Neon PostgreSQL | Free | $19 | $69 |
| Redis (Upstash) | Free | $10 | $50 |
| Vercel (Frontend) | Free | Free | $20 |
| **Total Infra** | **$10** | **$69** | **$339** |
