"""Generate a self-contained light-theme HTML evaluation report (print-to-PDF ready)."""

from __future__ import annotations

import html

from .models import ComparisonResult, ScenarioSpec, SimFrame


def render_evaluation_report_html(
    scenario: ScenarioSpec,
    final_frame: SimFrame,
    comparison: ComparisonResult,
) -> str:
    pm = comparison.primary_metrics
    sm = comparison.secondary_metrics
    esc = html.escape

    alert_rows = (
        "".join(
            f"""
        <tr>
          <td>{(a.time_ms / 1000):.1f}s</td>
          <td><span class="badge badge-{esc(a.severity)}">{esc(a.severity.upper())}</span></td>
          <td>{esc(a.title)}</td>
          <td>{esc(", ".join(a.involved))}</td>
          <td>{esc(a.message)}</td>
        </tr>
        """
            for a in final_frame.alerts
        )
        or '<tr><td colspan="5">No alerts recorded in this run.</td></tr>'
    )

    decision_rows = (
        "".join(
            f"""
        <tr>
          <td>{(d.time_ms / 1000):.1f}s</td>
          <td><strong>{esc(d.callsign)}</strong></td>
          <td><code>{esc(d.instruction)}</code></td>
          <td>{esc(d.reason)}</td>
          <td>{round(d.confidence * 100)}%</td>
          <td>{esc(d.safety_filter_status.upper())}</td>
        </tr>
        """
            for d in final_frame.decisions
        )
        or '<tr><td colspan="6">No controller interventions recorded.</td></tr>'
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ATC Evaluation Report — {esc(scenario.name)}</title>
  <style>
    :root {{
      color-scheme: light only;
      --ink: #071B2B;
      --teal: #167D8D;
      --aqua: #B9E4E8;
      --paper: #EEEEEE;
      --white: #FFFFFF;
      --advisory: #167D8D;
      --caution: #D97706;
      --warning: #DC2626;
    }}
    body {{
      margin: 0;
      padding: 24px;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.45;
    }}
    .banner {{
      background: var(--ink);
      color: var(--white);
      padding: 8px 16px;
      border-radius: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }}
    .card {{
      background: var(--white);
      border: 1px solid rgba(7, 27, 43, 0.12);
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
    }}
    .card-header {{
      background: var(--aqua);
      padding: 10px 16px;
      font-weight: 700;
      border-bottom: 1px solid rgba(7, 27, 43, 0.12);
    }}
    .card-body {{
      padding: 16px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
    }}
    th, td {{
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid rgba(7, 27, 43, 0.12);
    }}
    .badge {{
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 11px;
    }}
    .badge-advisory {{ background: var(--advisory); color: var(--white); }}
    .badge-caution {{ background: var(--caution); color: var(--ink); }}
    .badge-warning {{ background: var(--warning); color: var(--white); }}
    @media print {{
      body {{ background: var(--white); padding: 0; }}
    }}
  </style>
</head>
<body>
  <div class="banner">SIMULATION ONLY - NOT FOR OPERATIONAL USE</div>
  <div class="card">
    <div class="card-header">
      Scenario Evaluation Summary — {esc(scenario.name)} (Seed {comparison.seed})
    </div>
    <div class="card-body">
      <p>{esc(scenario.description)}</p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Primary ({esc(comparison.primary_controller)}) — Teal #167D8D</th>
            <th>Secondary ({esc(comparison.secondary_controller)}) — Ink #071B2B</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Minimum Separation (m)</td>
            <td><strong>{pm.min_separation_m} m</strong></td>
            <td>{sm.min_separation_m} m</td>
          </tr>
          <tr>
            <td>Near-Miss Count (&lt; 220 m)</td>
            <td><strong>{pm.near_miss_count}</strong></td>
            <td>{sm.near_miss_count}</td>
          </tr>
          <tr>
            <td>Total Alerts (Warning / Caution / Advisory)</td>
            <td>
              {pm.total_alerts} ({pm.warning_alerts} / {pm.caution_alerts} / {pm.advisory_alerts})
            </td>
            <td>
              {sm.total_alerts} ({sm.warning_alerts} / {sm.caution_alerts} / {sm.advisory_alerts})
            </td>
          </tr>
          <tr>
            <td>Controller Instructions Issued</td>
            <td>{pm.instructions_issued}</td>
            <td>{sm.instructions_issued}</td>
          </tr>
          <tr>
            <td>Safety Filter Interventions</td>
            <td>{pm.safety_filter_interventions}</td>
            <td>{sm.safety_filter_interventions}</td>
          </tr>
          <tr>
            <td>Average Surface Delay (s)</td>
            <td>{pm.avg_taxi_delay_s} s</td>
            <td>{sm.avg_taxi_delay_s} s</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header">Controller Decisions &amp; Safety Filter Log</div>
    <div class="card-body">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Callsign</th>
            <th>Instruction</th>
            <th>Reason</th>
            <th>Confidence</th>
            <th>Safety Filter</th>
          </tr>
        </thead>
        <tbody>{decision_rows}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header">Safety Alerts Log</div>
    <div class="card-body">
      <table>
        <thead>
          <tr><th>Time</th><th>Severity</th><th>Alert</th><th>Aircraft</th><th>Details</th></tr>
        </thead>
        <tbody>{alert_rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>
"""
