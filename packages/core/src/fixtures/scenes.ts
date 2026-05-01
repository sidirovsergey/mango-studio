export interface DemoScene {
  scene_id: string;
  title: string;
  description: string;
  video_url: string;
  poster_url: string;
  end_frame_url: string;
  duration_sec: number;
  cost_usd: number;
  latency_ms: number;
}

const s1: DemoScene = {
  scene_id: 's1',
  title: 'Собеседование',
  description: '«Сегодня у меня собеседование. Я готов на всё, чтобы получить работу!»',
  video_url: '/demo-fixtures/scene-s1.mp4',
  poster_url: '/demo-fixtures/scene-s1-poster.png',
  end_frame_url: '/demo-fixtures/scene-s1-end.png',
  duration_sec: 8,
  cost_usd: 0,
  latency_ms: 0,
};

const s2: DemoScene = {
  scene_id: 's2',
  title: 'Резюме',
  description: '«Так… в резюме написано "хорошо плаваю". И это всё?»',
  video_url: '/demo-fixtures/scene-s2.mp4',
  poster_url: '/demo-fixtures/scene-s2-poster.png',
  end_frame_url: '/demo-fixtures/scene-s2-end.png',
  duration_sec: 6,
  cost_usd: 0,
  latency_ms: 0,
};

const s3: DemoScene = {
  scene_id: 's3',
  title: 'Печать',
  description: '«Нам нужен кто-то, кто умеет печатать. У тебя даже пальцев нет!»',
  video_url: '/demo-fixtures/scene-s3.mp4',
  poster_url: '/demo-fixtures/scene-s3-poster.png',
  end_frame_url: '/demo-fixtures/scene-s3-end.png',
  duration_sec: 8,
  cost_usd: 0,
  latency_ms: 0,
};

const s4: DemoScene = {
  scene_id: 's4',
  title: 'Дверь',
  description: 'Дэнни не помещается в дверь кабинета.',
  video_url: '/demo-fixtures/scene-s4.mp4',
  poster_url: '/demo-fixtures/scene-s4-poster.png',
  end_frame_url: '/demo-fixtures/scene-s4-end.png',
  duration_sec: 8,
  cost_usd: 0,
  latency_ms: 0,
};

const s5: DemoScene = {
  scene_id: 's5',
  title: 'Финал',
  description: 'Развязка: Джек предлагает должность инструктора по плаванию для крабиков.',
  video_url: '/demo-fixtures/scene-s5.mp4',
  poster_url: '/demo-fixtures/scene-s5-poster.png',
  end_frame_url: '/demo-fixtures/scene-s5-end.png',
  duration_sec: 10,
  cost_usd: 0,
  latency_ms: 0,
};

export const demoScenes: Record<string, DemoScene> = {
  s1,
  s2,
  s3,
  s4,
  s5,
  default: s1,
};
