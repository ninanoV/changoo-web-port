export const INVENTORY_IMAGES = ['ball.app', 'wbomb.app', 'item_m.app', 'item_f.app', 'item_si.app', 'item_ym.app', 'item_fr.app', 'item_w.app'];
export const INVENTORY_LABELS = ['공', '물폭탄', '엄마', '아빠', '흰둥이', '유리 엄마', '친구들', '아줌마들'];

export function createInventory(selected) {
  return { cursor: selected, upHeld: false, downHeld: false, enterHeld: false, removed: false };
}

export function stepInventory(menu, input, player, busy = false) {
  let summon;
  // 0x42f060 commits on Enter release, before processing this tick's arrow keys.
  if (input.enter) menu.enterHeld = true;
  else if (menu.enterHeld) {
    menu.enterHeld = false;
    menu.removed = true;
    player.selectedItem = menu.cursor;
    if (!busy && menu.cursor >= 2 && player.companionItems[menu.cursor - 2] > 0) {
      const cost = menu.cursor === 2 ? Math.min(2, player.companionItems[0]) : 1;
      player.companionItems[menu.cursor - 2] -= cost;
      summon = { slot: menu.cursor, cost };
    }
  }
  if (input.up && !menu.upHeld) menu.cursor = Math.max(0, menu.cursor - 1);
  if (input.down && !menu.downHeld) menu.cursor = Math.min(7, menu.cursor + 1);
  menu.upHeld = Boolean(input.up);
  menu.downHeld = Boolean(input.down);
  return summon;
}
