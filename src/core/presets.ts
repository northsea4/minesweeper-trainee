export interface Preset {
  id: string;
  name: string;
  width: number;
  height: number;
  mines: number;
}

export const PRESETS: Preset[] = [
  { id: "beginner", name: "初级", width: 9, height: 9, mines: 10 },
  { id: "intermediate", name: "中级", width: 16, height: 16, mines: 40 },
  { id: "expert", name: "高级", width: 30, height: 16, mines: 99 },
];

export const DEFAULT_PRESET = PRESETS[0];
