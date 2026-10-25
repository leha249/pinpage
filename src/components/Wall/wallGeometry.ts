import type { WallBlock } from '../../types';

export function cloneBlocks(blocks: WallBlock[]): WallBlock[] {
  return JSON.parse(JSON.stringify(blocks));
}

export function newBlockId(): string {
  return 'b' + Date.now() + Math.random().toString(36).slice(2, 6);
}

export const DEFAULT_SIZE: Record<WallBlock['type'], { w: number; h: number }> = {
  text: { w: 260, h: 115 },
  image: { w: 240, h: 180 },
  video: { w: 280, h: 200 },
  music: { w: 300, h: 90 },
};

export function randomSpot() {
  return { x: 60 + Math.random() * 150, y: 60 + Math.random() * 150 };
}
