import type { Frame, Page } from '@playwright/test';

export async function selectFirstReaderText(page: Page, maxChars = 36) {
  await page.waitForSelector('iframe', { state: 'attached', timeout: 45_000 });

  const popup = page.locator('.selection-popup').first();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const viewport = page.viewportSize();
    const frames: Frame[] = [];

    for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
      const frameElement = await frame.frameElement().catch(() => null);
      const box = await frameElement?.boundingBox().catch(() => null);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      if (
        viewport &&
        (box.x + box.width < 0 ||
          box.y + box.height < 0 ||
          box.x > viewport.width ||
          box.y > viewport.height)
      ) {
        continue;
      }
      frames.push(frame);
    }

    for (const frame of frames) {
      const selected = await frame
        .evaluate((limit) => {
          const body = document.body;
          if (!body) return false;

          const isVisibleTextNode = (node: Node) => {
            const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            if (text.length < 16) return false;
            const parent = node.parentElement;
            if (!parent) return false;
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = parent.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };

          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              return isVisibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
          });

          let node = walker.nextNode();
          while (node?.textContent) {
            const text = node.textContent;
            const start = Math.max(0, text.search(/\S/));
            const end = Math.min(text.length, start + limit);
            if (end <= start) {
              node = walker.nextNode();
              continue;
            }

            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);

            const rect = range.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
              node = walker.nextNode();
              continue;
            }

            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);

            const clientX = rect.left + Math.max(1, rect.width / 2);
            const clientY = rect.top + Math.max(1, rect.height / 2);
            const target = node.parentElement ?? body;
            document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
            target.dispatchEvent(
              new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                pointerType: 'mouse',
                isPrimary: true,
                button: 0,
                buttons: 0,
                clientX,
                clientY,
                screenX: clientX,
                screenY: clientY,
              }),
            );
            target.dispatchEvent(
              new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: 0,
                clientX,
                clientY,
                screenX: clientX,
                screenY: clientY,
              }),
            );
            return true;
          }

          return false;
        }, maxChars)
        .catch(() => false);

      if (!selected) continue;

      try {
        await popup.waitFor({ state: 'visible', timeout: 5_000 });
        return;
      } catch {
        await page.keyboard.press('Escape').catch(() => undefined);
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error('Unable to select reader text in any reader iframe.');
}
