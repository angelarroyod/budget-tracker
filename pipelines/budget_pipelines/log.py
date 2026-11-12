import json
import sys
from datetime import UTC, datetime


def log(event: str, level: str = "info", **fields) -> None:
    """One JSON object per line on stdout: what Vercel, GitHub Actions and any log drain can parse."""
    record = {"ts": datetime.now(UTC).isoformat(timespec="milliseconds"), "level": level, "event": event, **fields}
    print(json.dumps(record, default=str), file=sys.stdout, flush=True)
