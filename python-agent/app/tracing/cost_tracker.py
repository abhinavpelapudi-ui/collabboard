from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Pricing per token by provider and model
MODEL_PRICING = {
    # Groq (free tier, but track notional cost)
    "llama-3.3-70b-versatile": {"input": 0.59 / 1_000_000, "output": 0.79 / 1_000_000},
    "llama-3.1-8b-instant": {"input": 0.05 / 1_000_000, "output": 0.08 / 1_000_000},
    "mixtral-8x7b-32768": {"input": 0.24 / 1_000_000, "output": 0.24 / 1_000_000},
    # OpenAI
    "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
    "gpt-4o": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    # Anthropic
    "claude-haiku-4-5-20251001": {"input": 0.80 / 1_000_000, "output": 4.00 / 1_000_000},
    "claude-sonnet-4-5-20250929": {"input": 3.00 / 1_000_000, "output": 15.00 / 1_000_000},
    # Deterministic route (zero-cost bypass)
    "deterministic": {"input": 0.0, "output": 0.0},
}


@dataclass
class CostRecord:
    timestamp: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    trace_id: str
    operation: str


@dataclass
class CostTracker:
    records: deque = field(default_factory=lambda: deque(maxlen=10000))

    def record(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        trace_id: str,
        operation: str,
    ) -> float:
        pricing = MODEL_PRICING.get(model, {"input": 0, "output": 0})
        cost = input_tokens * pricing["input"] + output_tokens * pricing["output"]
        self.records.append(
            CostRecord(
                timestamp=datetime.now(timezone.utc).isoformat(),
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost,
                trace_id=trace_id,
                operation=operation,
            )
        )
        return cost

    def get_summary(self) -> dict:
        total_cost = sum(r.cost_usd for r in self.records)
        total_input = sum(r.input_tokens for r in self.records)
        total_output = sum(r.output_tokens for r in self.records)

        by_operation: dict[str, dict] = {}
        for r in self.records:
            if r.operation not in by_operation:
                by_operation[r.operation] = {"count": 0, "cost_usd": 0.0, "tokens": 0}
            by_operation[r.operation]["count"] += 1
            by_operation[r.operation]["cost_usd"] += r.cost_usd
            by_operation[r.operation]["tokens"] += r.input_tokens + r.output_tokens

        by_model: dict[str, dict] = {}
        for r in self.records:
            if r.model not in by_model:
                by_model[r.model] = {"count": 0, "cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0}
            by_model[r.model]["count"] += 1
            by_model[r.model]["cost_usd"] += r.cost_usd
            by_model[r.model]["input_tokens"] += r.input_tokens
            by_model[r.model]["output_tokens"] += r.output_tokens

        return {
            "total_cost_usd": round(total_cost, 6),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_requests": len(self.records),
            "by_operation": by_operation,
            "by_model": by_model,
            "recent": [
                {
                    "timestamp": r.timestamp,
                    "model": r.model,
                    "input_tokens": r.input_tokens,
                    "output_tokens": r.output_tokens,
                    "cost_usd": round(r.cost_usd, 6),
                    "operation": r.operation,
                }
                for r in self.records[-20:]
            ],
        }


# Singleton instance
cost_tracker = CostTracker()
