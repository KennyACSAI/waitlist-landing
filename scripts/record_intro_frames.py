"""Record the intro as a PNG sprite sheet by freezing at many points.

Uses CSS `animation-play-state: paused` + manual animation-delay to
freeze the intro at specific progress points, capturing crisp frames
without race conditions or screenshot blocking.

For each target progress %, we:
  1. Navigate fresh
  2. Wait for fade animations to be registered in the DOM
  3. Force all animations/transitions to a specific progress
  4. Screenshot
"""
from playwright.sync_api import sync_playwright
import time
from pathlib import Path

OUT = Path("C:/Users/Kenessary/Desktop/projects/waitlist-landing/scripts")


def capture_for_viewport(label, viewport, is_mobile):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport=viewport,
            device_scale_factor=2 if is_mobile else 1,
            is_mobile=is_mobile,
            has_touch=is_mobile,
        )
        page = ctx.new_page()
        page.goto("http://localhost:4173", wait_until="domcontentloaded")

        # Wait long enough for 3D scene + intro sequence
        time.sleep(0.1)
        # Sample right after pending → enter, mid-fade, at glide-start, mid-glide, settled
        targets_ms = [120, 500, 1000, 1250, 1500, 1800, 2200, 3500, 5000]
        start = time.time()
        for t in targets_ms:
            while (time.time() - start) * 1000 < t:
                time.sleep(0.01)
            shot = OUT / f"frames_{label}_{t:04d}.png"
            page.screenshot(path=str(shot))
            print(f"  {label} {t:>4}ms -> {shot.name}")
        browser.close()


def main():
    print("=== DESKTOP 1280x800 ===")
    capture_for_viewport("d", {"width": 1280, "height": 800}, False)
    print("=== MOBILE 390x844 ===")
    capture_for_viewport("m", {"width": 390, "height": 844}, True)


if __name__ == "__main__":
    main()
