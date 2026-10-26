#!/usr/bin/env python3
"""Record a homepage demo GIF from a real fixture run + UI storyboard."""

from __future__ import annotations

import json
import os
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "sample-west"
OUT_GIF = ROOT / "docs" / "demo.gif"
CAPTURE = ROOT / "docs" / "demo-capture"


def font(size: int) -> ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_TITLE = font(22)
F_UI = font(16)
F_SMALL = font(13)
F_CODE = font(12)


def round_rect(draw: ImageDraw.ImageDraw, xy, fill, radius=10, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def base_window(title: str, w=920, h=520) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (w, h), "#1e1e1e")
    draw = ImageDraw.Draw(img)
    # title bar
    round_rect(draw, (0, 0, w, 36), "#2d2d2d", radius=0)
    draw.ellipse((12, 10, 24, 22), fill="#ff5f56")
    draw.ellipse((30, 10, 42, 22), fill="#ffbd2e")
    draw.ellipse((48, 10, 60, 22), fill="#27c93f")
    draw.text((80, 8), title, fill="#cccccc", font=F_SMALL)
    return img, draw


def draw_sidebar(draw, x, y, w, h, cases: list[tuple[str, str]], highlight=None, show_autopilot=False):
    round_rect(draw, (x, y, x + w, y + h), "#252526", radius=6, outline="#3c3c3c")
    draw.text((x + 12, y + 10), "ZTEST", fill="#4fc1ff", font=F_TITLE)
    # toolbar
    tools = ["↻ Refresh", "▶ Run All"]
    if show_autopilot:
        tools.append("✨ auto-poilot-fix")
    tx = x + 12
    for t in tools:
        color = "#ce9178" if "auto-poilot" in t else "#d4d4d4"
        draw.text((tx, y + 42), t, fill=color, font=F_SMALL)
        tx += 8 + int(draw.textlength(t, font=F_SMALL))

    cy = y + 72
    for name, status in cases:
        icon = {"pass": "✓", "fail": "✗", "run": "…", "idle": "○"}.get(status, "○")
        color = {
            "pass": "#89d185",
            "fail": "#f14c4c",
            "run": "#cca700",
            "idle": "#808080",
        }.get(status, "#808080")
        bg = "#37373d" if highlight == name else None
        if bg:
            round_rect(draw, (x + 8, cy - 2, x + w - 8, cy + 22), bg, radius=4)
        draw.text((x + 16, cy), f"{icon}  {name}", fill=color, font=F_UI)
        cy += 28


def draw_panel(draw, x, y, w, h, title: str, lines: list[str], accent="#cccccc"):
    round_rect(draw, (x, y, x + w, y + h), "#1b1b1b", radius=6, outline="#3c3c3c")
    draw.text((x + 12, y + 10), title, fill="#4fc1ff", font=F_UI)
    ty = y + 40
    for line in lines:
        draw.text((x + 12, ty), line[:88], fill=accent if "FAIL" in line or "fail" in line.lower() else "#d4d4d4", font=F_CODE)
        ty += 18
        if ty > y + h - 20:
            break


def run_fixture() -> dict:
    CAPTURE.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = f"{FIXTURE / 'bin'}:{env.get('PATH', '')}"
    env["ZTEST_WORKSPACE"] = str(FIXTURE)

    # Real run via mock west wrapper
    cmd = [str(FIXTURE / ".start_docker.sh"), "-b", "native_sim", "west", "twister", "-T", "tests", "--platform", "native_sim"]
    proc = subprocess.run(cmd, cwd=str(FIXTURE), capture_output=True, text=True, env=env)
    log = (proc.stdout or "") + (proc.stderr or "")
    (CAPTURE / "twister.log").write_text(log)
    report_path = FIXTURE / "twister-out" / "twister.json"
    report = {}
    if report_path.exists():
        report = json.loads(report_path.read_text())
        (CAPTURE / "twister.json").write_text(json.dumps(report, indent=2))

    # Build auto-pilot prompt via node (compiled) if available
    prompt = ""
    node = os.environ.get("NODE_BIN", "node")
    script = ROOT / "scripts" / "dump_autopilot_prompt.js"
    if script.exists():
        p = subprocess.run([node, str(script)], cwd=str(ROOT), capture_output=True, text=True, env=env)
        prompt = p.stdout or ""
        (CAPTURE / "autopilot-prompt.md").write_text(prompt)

    return {"exit": proc.returncode, "log": log, "report": report, "prompt": prompt}


def frames_from_run(data: dict) -> list[Image.Image]:
    cases_idle = [
        ("math_suite", "idle"),
        ("  test_add", "idle"),
        ("  test_sub", "idle"),
        ("  test_mul", "idle"),
        ("string_suite", "idle"),
        ("  test_strlen", "idle"),
        ("  test_strcmp", "idle"),
        ("  test_fail_demo", "idle"),
    ]
    cases_run = [(n, "run" if "test_" in n else "idle") for n, _ in cases_idle]
    cases_done = [
        ("math_suite", "pass"),
        ("  test_add", "pass"),
        ("  test_sub", "pass"),
        ("  test_mul", "pass"),
        ("string_suite", "fail"),
        ("  test_strlen", "pass"),
        ("  test_strcmp", "pass"),
        ("  test_fail_demo", "fail"),
    ]

    log_lines = [ln for ln in data["log"].splitlines() if ln.strip()][-12:]
    prompt_lines = (data["prompt"] or "evidence-first auto-poilot-fix prompt").splitlines()[:14]

    def hold(img: Image.Image, n: int) -> list[Image.Image]:
        return [img.copy() for _ in range(n)]

    frames: list[Image.Image] = []

    # 1 discover
    img, draw = base_window("ZTEST Suit — fixtures/sample-west")
    draw_sidebar(draw, 16, 48, 300, 450, cases_idle)
    draw_panel(draw, 332, 48, 570, 450, "Output · ZTEST", ["$ Refresh Tests", "discovered 2 suite(s), 6 case(s)", "", "Ready."])
    frames += hold(img, 10)

    # 2 running
    img, draw = base_window("ZTEST Suit — Run All")
    draw_sidebar(draw, 16, 48, 300, 450, cases_run)
    draw_panel(
        draw,
        332,
        48,
        570,
        450,
        "Output · ZTEST",
        ["$ ./.start_docker.sh -b native_sim west twister -T tests --platform native_sim", ""]
        + log_lines[:8],
    )
    frames += hold(img, 12)

    # 3 results with fail
    img, draw = base_window("ZTEST Suit — 5 passed, 1 failed")
    draw_sidebar(draw, 16, 48, 300, 450, cases_done, highlight="  test_fail_demo", show_autopilot=True)
    draw_panel(
        draw,
        332,
        48,
        570,
        450,
        "Output · ZTEST",
        log_lines + ["", "ZTEST: finished with exit code 1."],
        accent="#f14c4c",
    )
    frames += hold(img, 14)

    # 4 auto-poilot-fix
    img, draw = base_window("auto-poilot-fix → Copilot / Agent")
    draw_sidebar(draw, 16, 48, 260, 450, cases_done, show_autopilot=True)
    draw_panel(
        draw,
        292,
        48,
        610,
        450,
        "Copilot · evidence first",
        prompt_lines
        or [
            "## Rules (evidence first)",
            "1. Use the evidence below before changing code.",
            "2. Decide: production code / test / environment.",
            "",
            "## Failed cases",
            "- string_suite.test_fail_demo @ tests/string/src/test_string.c",
            "",
            "## Run evidence",
            "FAIL - string_suite.test_fail_demo",
            "",
            "## Task",
            "Investigate, then implement the smallest fix.",
        ],
    )
    frames += hold(img, 16)

    # 5 end card
    img, draw = base_window("ZTEST Suit")
    round_rect(draw, (80, 120, 840, 400), "#252526", radius=16, outline="#4fc1ff", width=2)
    draw.text((120, 160), "ZTEST Suit", fill="#4fc1ff", font=font(36))
    draw.text((120, 220), "Discover · Run · Fail → auto-poilot-fix", fill="#d4d4d4", font=F_TITLE)
    draw.text((120, 270), "Evidence-first Copilot handoff for Zephyr ZTEST", fill="#9cdcfe", font=F_UI)
    draw.text((120, 330), "github.com/YanChao1999/ztest-suit", fill="#808080", font=F_SMALL)
    frames += hold(img, 12)

    return frames


def main() -> None:
    OUT_GIF.parent.mkdir(parents=True, exist_ok=True)
    print("Running fixture twister (mock west)…")
    data = run_fixture()
    print(f"twister exit={data['exit']}")
    print("Rendering GIF frames…")
    frames = frames_from_run(data)
    # duration ms per frame
    # Keep duplicate frames for timing (do not optimize — it collapses holds).
    frames[0].save(
        OUT_GIF,
        save_all=True,
        append_images=frames[1:],
        duration=160,
        loop=0,
        optimize=False,
        disposal=2,
    )
    print(f"Wrote {OUT_GIF} ({OUT_GIF.stat().st_size} bytes, {len(frames)} frames)")


if __name__ == "__main__":
    main()
