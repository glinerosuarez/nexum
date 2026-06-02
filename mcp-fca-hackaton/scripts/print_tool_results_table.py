"""Print aligned summary table from test_all_tools.sh results file."""
import os
import sys

path = os.environ.get("RESULTS_FILE")
if not path:
    sys.exit(0)

rows = []
with open(path, encoding="utf-8") as fh:
    for line in fh:
        parts = line.rstrip("\n").split("\t", 2)
        if len(parts) == 3:
            rows.append(parts)

if not rows:
    sys.exit(0)

w_tool = max(len("Tool"), max(len(r[0]) for r in rows))
w_stat = max(len("Status"), max(len(r[1]) for r in rows))
width = w_tool + w_stat + 80

print()
print("=" * width)
print(f"{'Tool'.ljust(w_tool)}  {'Status'.ljust(w_stat)}  Summary")
print("-" * width)
for tool, status, summary in rows:
    print(f"{tool.ljust(w_tool)}  {status.ljust(w_stat)}  {summary}")
print("=" * width)
