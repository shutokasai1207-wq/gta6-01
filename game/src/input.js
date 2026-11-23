// Keyboard and mouse input. Movement is read as held state (axes for walking,
// throttle and steering for driving); the verbs — confirm, pause, interact — are
// one-shot actions a screen or the world takes once with takeActions().

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyP',
]);

/**
 * Listen on the window (and the canvas for clicks). Returns the reader the loop
 * polls each frame; nothing here knows what the keys mean to the game.
 */
export function createInput(canvas) {
  const held = new Set();
  let pending = 0;

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') pending |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') pending |= ACTION_PAUSE;
    if (event.code === 'KeyE' || event.code === 'KeyF') pending |= ACTION_INTERACT;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointerdown', () => {
    pending |= ACTION_CONFIRM;
  });

  const down = (code) => held.has(code);

  return {
    /** Walking axis, -1..1 on each side; diagonals are normalised by the caller. */
    moveX: () => (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0),
    moveY: () => (down('KeyS') || down('ArrowDown') ? 1 : 0) - (down('KeyW') || down('ArrowUp') ? 1 : 0),
    /** Driving: 1 is full throttle, -1 is brake / reverse. */
    throttle: () => (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0),
    /** Driving: -1 steers left, 1 steers right. */
    steer: () => (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0),
    /** Handbrake (Space while driving). */
    handbrake: () => down('Space'),
    /** Take the one-shot actions pressed since the last call, clearing them. */
    takeActions() {
      const actions = pending;
      pending = 0;
      return actions;
    },
  };
}
