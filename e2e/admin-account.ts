import { expect, type Locator } from "@playwright/test";

// The admin's account block on the dark band (sidebar and narrow-screen menu): the name and "Keluar"
// fit within the 44 px avatar, and "Keluar" still has a 44 x 44 px hit area (its ::before reaches past
// the compact text, so it does not push the layout).
export async function expectAccountFitsAvatar(container: Locator) {
  const signOut = container.getByRole("button", { name: /^(Keluar|Log out)$/ });
  const geometry = await signOut.evaluate((button) => {
    const row = button.closest("form")?.parentElement?.parentElement;
    const avatar = row?.firstElementChild;
    const name = row?.querySelector("p");
    if (!row || !avatar || !name) throw new Error("The account block is not avatar + (name, sign-out form)");
    const text = document.createRange();
    text.selectNodeContents(button);

    const box = button.getBoundingClientRect();
    const before = getComputedStyle(button, "::before");
    const px = (value: string) => Number.parseFloat(value) || 0;
    const hit = {
      top: box.top + px(before.top),
      bottom: box.bottom - px(before.bottom),
      left: box.left + px(before.left),
      right: box.right - px(before.right),
    };
    // Every corner of the hit area (1 px in) and its middle land on the button.
    const points = [
      [hit.left + 1, hit.top + 1],
      [hit.right - 1, hit.top + 1],
      [hit.left + 1, hit.bottom - 1],
      [hit.right - 1, hit.bottom - 1],
      [(hit.left + hit.right) / 2, (hit.top + hit.bottom) / 2],
    ];
    const allHit = points.every(([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return element !== null && button.contains(element);
    });
    return {
      avatar: avatar.getBoundingClientRect().toJSON() as DOMRect,
      nameTop: name.getBoundingClientRect().top,
      textBottom: text.getBoundingClientRect().bottom,
      hitWidth: hit.right - hit.left,
      hitHeight: hit.bottom - hit.top,
      allHit,
    };
  });

  expect(geometry.avatar.height).toBeGreaterThanOrEqual(44);
  expect(geometry.nameTop).toBeGreaterThanOrEqual(geometry.avatar.top - 2);
  expect(geometry.nameTop).toBeLessThanOrEqual(geometry.avatar.top + 2);
  expect(geometry.textBottom).toBeGreaterThanOrEqual(geometry.avatar.bottom - 2);
  expect(geometry.textBottom).toBeLessThanOrEqual(geometry.avatar.bottom + 2);
  expect(geometry.hitWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.hitHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.allHit).toBe(true);
}
