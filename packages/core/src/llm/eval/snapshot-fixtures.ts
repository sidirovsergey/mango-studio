/**
 * Canonical snapshot fixtures for Phase-1.4 prompt-builder regression tests.
 *
 * 5 scenes  — quiet / action / dialogue_close_up / wide_environment / multi_character
 * 2 scripts — 15s economy (3 scenes) / 60s premium (8 scenes, total 60s)
 *
 * Rules:
 *  - Hand-authored, no LLM generation.
 *  - Fully structured: every Phase-1.4.A field populated.
 *  - Deterministic: no Date.now(), no Math.random().
 *  - All fixtures parse cleanly via SceneSchema / ScriptGenSchema.
 *  - NOT re-exported from the core barrel.
 */

import type { Scene } from '../schemas';
import type { Script } from '../schemas';
import type { Character } from '../types';

// ─── Fixture interfaces ───────────────────────────────────────────────────────

export interface CanonicalSceneFixture {
  label: 'quiet' | 'action' | 'dialogue_close_up' | 'wide_environment' | 'multi_character';
  description: string;
  scene: Scene;
  characters: Character[];
}

export interface CanonicalScriptFixture {
  label: '15s' | '60s';
  description: string;
  script: Script;
}

// ─── Shared character definitions ────────────────────────────────────────────

/** Рыжий кот Апельсин — used across quiet/15s fixtures */
const CAT_APELSIN: Character = {
  id: '00000000-0000-0000-0001-000000000001',
  name: 'Апельсин',
  description: 'Рыжий полосатый кот с большими зелёными глазами. Ленивый, любит солнечные пятна.',
  full_prompt:
    'ginger tabby cat, bright orange fur with dark stripes, large green eyes, plump fluffy build, white paws',
  appearance: {
    species: 'кот',
    age: 'взрослый',
    build: 'пухленький, пушистый',
    distinctive: ['рыжие полосы', 'зелёные глаза', 'белые лапки'],
  },
  personality: 'Флегматичный философ. Жизнь хороша, пока есть солнечный луч.',
  voice: {
    tts_provider: 'elevenlabs',
    tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
    stability: 0.5,
    similarity_boost: 0.75,
  },
  dossier: null,
  reference_images: [],
};

/** Чёрный лабрадор Гром — used in action fixture */
const DOG_GROM: Character = {
  id: '00000000-0000-0000-0002-000000000001',
  name: 'Гром',
  description: 'Чёрный лабрадор-ретривер, молодой, энергичный, с блестящей шерстью.',
  full_prompt:
    'black labrador retriever, glossy coat, athletic muscular build, amber eyes, energetic posture',
  appearance: {
    species: 'собака',
    age: 'молодой',
    build: 'атлетичный, мускулистый',
    distinctive: ['чёрная блестящая шерсть', 'янтарные глаза'],
  },
  personality: 'Бесстрашный и жизнерадостный. Прыгает сначала, думает потом.',
  voice: {
    tts_provider: 'elevenlabs',
    tts_voice_id: 'TxGEqnHWrfWFTfGW9XjX',
    stability: 0.6,
    similarity_boost: 0.8,
  },
  dossier: null,
  reference_images: [],
};

/** Марина — женщина средних лет, dialogue close-up fixture */
const WOMAN_MARINA: Character = {
  id: '00000000-0000-0000-0003-000000000001',
  name: 'Марина',
  description: 'Женщина лет тридцати пяти, тёмные волосы, серые глаза, спокойный взгляд.',
  full_prompt:
    'woman mid-thirties, dark brown hair, grey eyes, calm expression, warm interior lighting',
  appearance: {
    age: 'тридцать пять',
    build: 'стройная',
    distinctive: ['тёмные волосы', 'серые глаза', 'спокойный взгляд'],
  },
  personality: 'Сдержанная, проницательная. Каждое слово взвешено.',
  voice: {
    tts_provider: 'elevenlabs',
    tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
    stability: 0.7,
    similarity_boost: 0.8,
    style: 0.1,
    speed: 0.9,
  },
  dossier: null,
  reference_images: [],
};

/** Лис Руслан — multi-character fixture */
const FOX_RUSLAN: Character = {
  id: '00000000-0000-0000-0004-000000000001',
  name: 'Руслан',
  description: 'Рыжий лис с пушистым хвостом и острыми ушами. Хитрый, но добродушный.',
  full_prompt:
    'red fox, fluffy white-tipped tail, sharp triangular ears, bright amber eyes, sitting on moss-covered log in forest',
  appearance: {
    species: 'лис',
    age: 'взрослый',
    build: 'стройный, гибкий',
    distinctive: ['рыжий мех', 'белый кончик хвоста', 'острые уши'],
  },
  personality: 'Хитрец с золотым сердцем. Говорит загадками, но всегда поможет.',
  voice: {
    tts_provider: 'elevenlabs',
    tts_voice_id: 'VR6AewLTigWG4xSOukaG',
    stability: 0.55,
    similarity_boost: 0.75,
  },
  dossier: null,
  reference_images: [],
};

/** Ворона Чёрная — multi-character fixture */
const CROW_CHERNAYA: Character = {
  id: '00000000-0000-0000-0005-000000000001',
  name: 'Чёрная',
  description: 'Иссиня-чёрная ворона с умными фиолетовыми глазами и хриплым голосом.',
  full_prompt:
    'black crow, iridescent blue-black feathers, intelligent violet eyes, perched on moss-covered log in dappled forest light',
  appearance: {
    species: 'ворона',
    age: 'взрослая',
    build: 'стройная, крылатая',
    distinctive: ['иссиня-чёрные перья с радужным отливом', 'фиолетовые глаза'],
  },
  personality: 'Язвительная мудрость. Притворяется циничной, но помнит каждое доброе дело.',
  voice: {
    tts_provider: 'elevenlabs',
    tts_voice_id: 'yoZ06aMxZJJ28mfd3POQ',
    stability: 0.65,
    similarity_boost: 0.7,
  },
  dossier: null,
  reference_images: [],
};

// ─── Canonical scene base (versioned arrays always empty at fixture time) ─────

const EMPTY_SCENE_VERSIONED = {
  first_frame_versions: [] as never[],
  first_frame_active_version_id: null,
  video_versions: [] as never[],
  video_active_version_id: null,
  voice_audio_versions: [] as never[],
  voice_audio_active_version_id: null,
  last_frame: null,
  final_clip: null,
};

// ─── 5 Canonical scenes ───────────────────────────────────────────────────────

export const CANONICAL_SCENES: ReadonlyArray<CanonicalSceneFixture> = [
  // ── 1. quiet ──────────────────────────────────────────────────────────────
  {
    label: 'quiet',
    description:
      'Cat sleeps on a sunlit windowsill. No dialogue. Static golden-hour shot. 5s hook.',
    characters: [CAT_APELSIN],
    scene: {
      scene_id: 'canon-quiet-01',
      description: 'Рыжий кот Апельсин спит, свернувшись на подоконнике в золотом луче солнца.',
      description_ru:
        'Рыжий кот Апельсин спит, свернувшись в клубок на подоконнике. Утренний луч солнца золотит его шерсть; грудь медленно поднимается и опускается в ровном дыхании.',
      description_en:
        'Ginger tabby cat Apelsin sleeps curled on a sunlit windowsill, slow chest rise and fall, golden morning light warming his fur.',
      duration_sec: 5,
      dialogue: null,
      character_ids: ['00000000-0000-0000-0001-000000000001'],
      composition: {
        shot_size: 'full',
        angle: 'eye_level',
        framing_notes: 'Кот в центре кадра, солнечный луч диагональю слева сверху.',
        subject_focus: 'Апельсин на подоконнике',
      },
      camera_movement: {
        kind: 'static',
        speed: 'slow',
        lens_character: '85mm f/1.8, мягкое боке на шторе',
      },
      lighting: {
        recipe: 'soft golden-hour key + warm fill + cool rim from outside',
        time_of_day: 'раннее утро',
        key_direction: 'слева через окно',
      },
      audio_direction: {
        ambient: 'тихое чириканье воробьёв, далёкий городской гул',
        music: 'нежное пианино, pianissimo, тёплый мажор',
        sfx: ['лёгкое мурлыканье'],
        voice_notes: undefined,
      },
      arc_role: 'hook',
      tier_at_gen: null,
      audio_mode: 'silent_tts',
      first_frame_source: 'auto_continuity',
      config_overrides: undefined,
      ...EMPTY_SCENE_VERSIONED,
    },
  },

  // ── 2. action ─────────────────────────────────────────────────────────────
  {
    label: 'action',
    description:
      'Black labrador sprints and leaps over a wooden fence. No dialogue, music+sfx. 7s climax.',
    characters: [DOG_GROM],
    scene: {
      scene_id: 'canon-action-01',
      description:
        'Чёрный лабрадор Гром разгоняется по двору и с силой перепрыгивает деревянный забор.',
      description_ru:
        'Гром несётся по двору, набирая скорость. За три шага до забора он отталкивается задними лапами, взлетает, передние лапы цепляются за верхушку досок — и он приземляется на той стороне с глухим ударом, готовый бежать дальше.',
      description_en:
        'Black labrador Grom sprints toward a wooden fence, launches with hind legs coiled, paws over the top, lands clean on the far side.',
      duration_sec: 7,
      dialogue: null,
      character_ids: ['00000000-0000-0000-0002-000000000001'],
      composition: {
        shot_size: 'full',
        angle: 'low_angle',
        framing_notes: 'Угол снизу подчёркивает мощь прыжка; забор как горизонтальная преграда.',
        subject_focus: 'Гром в прыжке над забором',
      },
      camera_movement: {
        kind: 'tracking',
        speed: 'medium',
        lens_character: '50mm, небольшое motion blur на фоне',
      },
      lighting: {
        recipe: 'overcast diffuse key + naturalistic fill',
        time_of_day: 'полдень, пасмурно',
        key_direction: 'сверху равномерно',
      },
      audio_direction: {
        ambient: 'шелест листьев, скрип досок',
        music: 'энергичный percussive трек, нарастает к прыжку',
        sfx: ['топот лап по земле', 'удар о доски', 'приземление с глухим стуком'],
        voice_notes: undefined,
      },
      arc_role: 'climax',
      tier_at_gen: null,
      audio_mode: 'silent_tts',
      first_frame_source: 'auto_continuity',
      config_overrides: undefined,
      ...EMPTY_SCENE_VERSIONED,
    },
  },

  // ── 3. dialogue_close_up ──────────────────────────────────────────────────
  {
    label: 'dialogue_close_up',
    description:
      'Close-up of Marina speaking English. English dialogue. Push-in slow on anamorphic. 8s rising.',
    characters: [WOMAN_MARINA],
    scene: {
      scene_id: 'canon-dialogue-cu-01',
      description:
        'Крупный план Марины: она смотрит в камеру, лёгкая улыбка трогает губы, и она произносит короткую фразу.',
      description_ru:
        'Марина стоит в затемнённом тёплом интерьере. Камера медленно надвигается. Её серые глаза встречаются с объективом; едва заметная улыбка появляется в уголках губ, и она говорит тихо, но отчётливо.',
      description_en:
        'Woman in mid-thirties, dim warm-lit interior, eyes meet camera, a faint smile crosses her lips as she speaks.',
      duration_sec: 8,
      dialogue: {
        speaker: '00000000-0000-0000-0003-000000000001',
        text: 'I see you.',
      },
      character_ids: ['00000000-0000-0000-0003-000000000001'],
      composition: {
        shot_size: 'close_up',
        angle: 'eye_level',
        framing_notes: 'Глаза по правилу третей, губы в нижней трети.',
        subject_focus: 'лицо Марины',
      },
      camera_movement: {
        kind: 'dolly_in',
        speed: 'slow',
        lens_character: '85mm anamorphic, горизонтальные блики на глазах',
      },
      lighting: {
        recipe: 'key from upper-left + soft fill + subtle golden-hour rim',
        time_of_day: 'вечер',
        key_direction: 'сверху слева, тёплый янтарный',
      },
      audio_direction: {
        ambient: 'тихий комнатный гул, далёкий дождь за окном',
        music: undefined,
        sfx: undefined,
        voice_notes: 'женский голос, тихо и отчётливо, с лёгкой загадочностью',
      },
      arc_role: 'rising',
      tier_at_gen: null,
      audio_mode: 'native',
      first_frame_source: 'auto_continuity',
      config_overrides: undefined,
      ...EMPTY_SCENE_VERSIONED,
    },
  },

  // ── 4. wide_environment ───────────────────────────────────────────────────
  {
    label: 'wide_environment',
    description:
      'Coastal cliff at dawn. No characters. Crane-up reveal. Cool magenta dawn light. 10s setup.',
    characters: [],
    scene: {
      scene_id: 'canon-wide-env-01',
      description:
        'Широкий план прибрежного утёса на рассвете: базальтовые колонны, море внизу, магентовый горизонт.',
      description_ru:
        'Рассвет над прибрежным утёсом. Базальтовые колонны поднимаются из моря; внизу медленно катятся тёмные волны. Камера медленно поднимается вверх, открывая всю высоту скалы и широту горизонта — сине-пурпурный рассвет окрашивает верхушки.',
      description_en:
        'Coastal cliff jagged with basalt columns, sea below in slow rolling swells, magenta dawn light catching the cliff tops, no human presence.',
      duration_sec: 10,
      dialogue: null,
      character_ids: [],
      composition: {
        shot_size: 'extreme_wide',
        angle: 'high_angle',
        framing_notes:
          'Скала занимает левые две трети, горизонт в верхней трети, море у основания.',
        subject_focus: 'утёс и рассветный горизонт',
      },
      camera_movement: {
        kind: 'crane_up',
        speed: 'slow',
        lens_character: '24mm wide, лёгкая дисторсия по краям',
      },
      lighting: {
        recipe: 'cool blue-magenta dawn key + soft fill from overcast horizon',
        time_of_day: 'рассвет, 5:30 утра',
        key_direction: 'справа сверху, горизонт',
      },
      audio_direction: {
        ambient: 'порывы ветра, далёкий прибой',
        music: 'разреженные струнные, медленные',
        sfx: ['свист ветра в базальтовых щелях', 'глухой удар волны о камень'],
        voice_notes: undefined,
      },
      arc_role: 'setup',
      tier_at_gen: null,
      audio_mode: 'silent_tts',
      first_frame_source: 'auto_continuity',
      config_overrides: undefined,
      ...EMPTY_SCENE_VERSIONED,
    },
  },

  // ── 5. multi_character ────────────────────────────────────────────────────
  {
    label: 'multi_character',
    description:
      'Fox and crow face each other on a mossy log. Russian dialogue (forces silent_tts). Orbit slow. 12s beat.',
    characters: [FOX_RUSLAN, CROW_CHERNAYA],
    scene: {
      scene_id: 'canon-multi-char-01',
      description:
        'Лис Руслан и ворона Чёрная стоят друг напротив друга на замшелом бревне в лесу.',
      description_ru:
        'В пятнистом лесном свете лис и ворона замерли, глядя друг на друга через бревно. Руслан чуть наклоняет голову набок. Чёрная расправляет перо, словно собираясь ответить. Камера медленно облетает их по дуге.',
      description_en:
        'Red fox and black crow face each other on a moss-covered log, fox tilts head, crow ruffles feathers, light leaks through canopy.',
      duration_sec: 12,
      dialogue: {
        speaker: '00000000-0000-0000-0004-000000000001',
        text: 'Привет.',
      },
      character_ids: [
        '00000000-0000-0000-0004-000000000001',
        '00000000-0000-0000-0005-000000000001',
      ],
      composition: {
        shot_size: 'medium',
        angle: 'eye_level',
        framing_notes:
          'Лис справа, ворона слева, бревно как горизонтальная ось, лес размыт за обоими.',
        subject_focus: 'встреча Руслана и Чёрной',
      },
      camera_movement: {
        kind: 'orbit',
        speed: 'slow',
        lens_character: '50mm, мягкое боке на листве',
      },
      lighting: {
        recipe: 'dappled forest key — sun patches through canopy + cool shadow fill',
        time_of_day: 'полдень, лес',
        key_direction: 'сверху сквозь листву, разрозненные пятна',
      },
      audio_direction: {
        ambient: 'птичий хор в кронах, шелест листьев',
        music: 'лёгкий акустический мотив, пиццикато',
        sfx: ['шорох перьев вороны', 'хруст ветки под лапой лиса'],
        voice_notes: 'Руслан — спокойно и дружелюбно, почти небрежно',
      },
      arc_role: 'beat',
      tier_at_gen: null,
      audio_mode: 'silent_tts',
      first_frame_source: 'auto_continuity',
      config_overrides: undefined,
      ...EMPTY_SCENE_VERSIONED,
    },
  },
] as const;

// ─── 2 Canonical scripts ──────────────────────────────────────────────────────

export const CANONICAL_SCRIPTS: ReadonlyArray<CanonicalScriptFixture> = [
  // ── 15s economy — 3 scenes × 5s, single character (cat), warm pastels ─────
  {
    label: '15s',
    description:
      '15s economy script. Cat Apelsin. 3 scenes: hook→rising→payoff. Warm pastel visual theme.',
    script: {
      title: 'Утро Апельсина',
      tier: 'economy',
      master_clip_versions: [],
      master_clip_active_version_id: null,
      visual_theme: {
        palette: ['#FDEEC8', '#F9A86A', '#C4E0A5', '#E8D5B7'],
        lighting: 'soft golden-hour key + warm fill',
        lens: '85mm shallow DOF',
        motion: 'locked-off + occasional gentle dolly',
        mood: 'cozy and warm',
        film_look: 'warm grain 16mm',
        avoid: ['cool blue tones', 'harsh shadows', 'fast cuts'],
      },
      narrator_voice: {
        tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
        persona:
          'Warm, mid-range female voice — General American — clear neutral timbre — gentle tempo with soft consonants — calm and reassuring baseline — slight warmth on vowels',
        stability: 0.65,
        similarity_boost: 0.75,
        style: 0.1,
        speed: 0.9,
      },
      characters: [
        {
          action: 'add',
          name: 'Апельсин',
          description:
            'Рыжий полосатый кот с большими зелёными глазами. Ленивый, любит солнечные пятна.',
          appearance: {
            species: 'кот',
            age: 'взрослый',
            build: 'пухленький, пушистый',
            distinctive: ['рыжие полосы', 'зелёные глаза', 'белые лапки'],
          },
          personality: 'Флегматичный философ. Жизнь хороша, пока есть солнечный луч.',
        },
      ],
      scenes: [
        {
          scene_id: 'script-15s-01',
          description: 'Апельсин просыпается в солнечном луче на подоконнике.',
          description_ru:
            'Утренний луч золотом падает на рыжий бок спящего Апельсина. Кот медленно открывает один зелёный глаз, щурится и снова закрывает.',
          description_en:
            'A golden morning beam falls on the sleeping ginger cat. Apelsin opens one green eye, squints, closes it again.',
          duration_sec: 5,
          dialogue: { speaker: 'narrator', text: 'Утро для Апельсина начиналось одинаково.' },
          character_ids: ['Апельсин'],
          composition: {
            shot_size: 'close_up',
            angle: 'eye_level',
            framing_notes: 'Глаз кота по правилу третей, солнечный луч диагональю.',
            subject_focus: 'Апельсин на подоконнике',
          },
          camera_movement: {
            kind: 'static',
            speed: 'slow',
            lens_character: '85mm f/1.8, боке на занавеске',
          },
          lighting: {
            recipe: 'soft golden-hour key + warm fill',
            time_of_day: 'раннее утро',
            key_direction: 'слева через окно',
          },
          audio_direction: {
            ambient: 'тихое чириканье воробьёв',
            music: 'нежное пианино, pianissimo',
            sfx: ['потягивание кота'],
            voice_notes: 'нарратор тихо, с улыбкой',
          },
          arc_role: 'hook',
          tier_at_gen: 'economy',
          audio_mode: 'auto',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        {
          scene_id: 'script-15s-02',
          description: 'Апельсин бредёт к миске — она пуста.',
          description_ru:
            'Апельсин спрыгивает с подоконника и важно шествует на кухню. Миска пуста. Кот смотрит в камеру с немым укором.',
          description_en:
            'Apelsin pads to the kitchen. The bowl is empty. He looks into the camera with wordless reproach.',
          duration_sec: 5,
          dialogue: {
            speaker: 'narrator',
            text: 'Первая проверка: миска. Итог: провал.',
          },
          character_ids: ['Апельсин'],
          composition: {
            shot_size: 'medium',
            angle: 'low_angle',
            framing_notes: 'Кот монументально над пустой миской, угол снизу.',
            subject_focus: 'Апельсин и пустая миска',
          },
          camera_movement: {
            kind: 'static',
            speed: 'medium',
            lens_character: '85mm, лёгкое боке на кухне',
          },
          lighting: {
            recipe: 'warm fill + cool rim from kitchen window',
            time_of_day: 'утро',
            key_direction: 'справа из окна',
          },
          audio_direction: {
            ambient: 'тиканье часов',
            music: 'пианино замирает',
            sfx: ['мягкие шаги по паркету', 'звон пустой миски'],
            voice_notes: 'нарратор с лёгкой иронией',
          },
          arc_role: 'rising',
          tier_at_gen: 'economy',
          audio_mode: 'auto',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        {
          scene_id: 'script-15s-03',
          description: 'Апельсин возвращается на подоконник — солнце всё ещё есть.',
          description_ru:
            'Убедившись в провале миски, Апельсин возвращается к подоконнику, сворачивается в клубок прямо в солнечном пятне и жмурится. Завтрак подождёт.',
          description_en:
            'Convinced the bowl is a lost cause, Apelsin returns to his sunspot, curls up, and squints contentedly. Breakfast can wait.',
          duration_sec: 5,
          dialogue: { speaker: 'narrator', text: 'Солнце осталось. Значит, день удался.' },
          character_ids: ['Апельсин'],
          composition: {
            shot_size: 'medium_close_up',
            angle: 'eye_level',
            framing_notes: 'Кот в клубке, за ним размытый силуэт города.',
            subject_focus: 'Апельсин, свернувшийся клубком',
          },
          camera_movement: {
            kind: 'dolly_out',
            speed: 'slow',
            lens_character: '85mm, тёплая виньетка по краям',
          },
          lighting: {
            recipe: 'soft golden-hour key + warm fill',
            time_of_day: 'утро, чуть позже',
            key_direction: 'слева, чуть ярче',
          },
          audio_direction: {
            ambient: 'далёкий городской гул, птицы',
            music: 'пианино возвращается, финальный аккорд',
            sfx: ['мурлыканье'],
            voice_notes: 'нарратор тепло, финально',
          },
          arc_role: 'payoff',
          tier_at_gen: 'economy',
          audio_mode: 'auto',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
      ],
    },
  },

  // ── 60s premium — 8 scenes, 2 characters, cinematic noir, total 60s ────────
  // Scene durations: 8+7+8+7+8+7+8+7 = 60s
  {
    label: '60s',
    description:
      '60s premium script. Detective Artyom + informant Vika. 8 scenes noir arc (hook→3×rising→climax→2×payoff→cta). Total 60s.',
    script: {
      title: 'Последний свидетель',
      tier: 'premium',
      master_clip_versions: [],
      master_clip_active_version_id: null,
      visual_theme: {
        palette: ['#0D0D0D', '#1C2B3A', '#B8860B', '#4A6741'],
        lighting: 'hard noir key — single source + deep shadows',
        lens: 'anamorphic 40mm, horizontal lens flares',
        motion: 'handheld breathing + occasional dolly',
        mood: 'tense noir mystery',
        film_look: 'desaturated blacks, teal-orange grade, grain 35mm',
        avoid: ['bright cheerful colours', 'soft pastel tones', 'flat lighting'],
      },
      narrator_voice: {
        tts_voice_id: 'onwK4e9ZLuTAKqWW03F9',
        persona:
          'Deep baritone — slight rasp — slow deliberate tempo — hard consonants — world-weary tone — dry sardonic undertone on exposition lines',
        stability: 0.7,
        similarity_boost: 0.8,
        style: 0.1,
        speed: 0.85,
      },
      characters: [
        {
          action: 'add',
          name: 'Артём',
          description:
            'Детектив лет сорока, усталый взгляд, мятый плащ, вечно с папкой. Видал всякое.',
          appearance: {
            age: 'сорок',
            build: 'худощавый, слегка сутулый',
            distinctive: ['мятый плащ', 'усталые серые глаза', 'щетина'],
          },
          personality: 'Циничный снаружи, идеалист внутри. Не бросает незаконченных дел.',
        },
        {
          action: 'add',
          name: 'Вика',
          description:
            'Молодая женщина, информатор детектива. Умная, осторожная, говорит вполголоса.',
          appearance: {
            age: 'двадцать восемь',
            build: 'невысокая, быстрая',
            distinctive: ['тёмный капюшон', 'настороженный взгляд'],
          },
          personality: 'Острый ум, минимум слов. Доверяет только фактам.',
        },
      ],
      scenes: [
        // scene-01: hook — 8s, Artyom enters rainy alley
        {
          scene_id: 'script-60s-01',
          description: 'Артём входит в ночной переулок под дождём.',
          description_ru:
            'Мокрая брусчатка отражает неоновые вывески. Артём поднимает воротник плаща и углубляется в переулок, папка зажата под мышкой, дождь барабанит по плечам.',
          description_en:
            'Wet cobblestones mirror neon signs. Artyom raises his collar and heads into the alley, briefcase tucked under his arm, rain drumming on his shoulders.',
          duration_sec: 8,
          dialogue: { speaker: 'narrator', text: 'Этот город никогда не спит. И я тоже.' },
          character_ids: ['Артём'],
          composition: {
            shot_size: 'full',
            angle: 'eye_level',
            framing_notes: 'Артём идёт из глубины на камеру, неоновые отражения в лужах по бокам.',
            subject_focus: 'Артём в переулке',
          },
          camera_movement: {
            kind: 'dolly_in',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, горизонтальные блики неона',
          },
          lighting: {
            recipe: 'hard neon key — teal + orange practicals — deep shadow fill',
            time_of_day: 'ночь',
            key_direction: 'слева, неоновая вывеска',
          },
          audio_direction: {
            ambient: 'дождь, далёкие городские звуки',
            music: 'тяжёлый бас-дрон, фортепиано',
            sfx: ['шаги по мокрой брусчатке', 'дождь'],
            voice_notes: 'нарратор — Артём, внутренний монолог, сухо',
          },
          arc_role: 'hook',
          tier_at_gen: 'premium',
          audio_mode: 'native',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-02: setup — 7s, Artyom finds a note
        {
          scene_id: 'script-60s-02',
          description: 'Артём находит записку на двери склада.',
          description_ru:
            'Артём останавливается у ржавой двери склада. Под дворником — конверт. Он достаёт листок, читает, брови чуть сходятся. Один нераспечатанный вопрос.',
          description_en:
            'Artyom stops at a rusted warehouse door. Under the wiper — an envelope. He pulls out a note, reads, brows knitting. One unanswered question.',
          duration_sec: 7,
          dialogue: null,
          character_ids: ['Артём'],
          composition: {
            shot_size: 'medium_close_up',
            angle: 'eye_level',
            framing_notes: 'Лицо Артёма слева, записка справа — оба резкие.',
            subject_focus: 'Артём читает записку',
          },
          camera_movement: {
            kind: 'static',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, лёгкое боке на двери',
          },
          lighting: {
            recipe: 'single overhead practial + deep shadow fill',
            time_of_day: 'ночь',
            key_direction: 'сверху, тусклый фонарь',
          },
          audio_direction: {
            ambient: 'капли дождя, далёкий гудок поезда',
            music: 'пианино, отдельные ноты',
            sfx: ['шорох бумаги', 'капля на металлический подоконник'],
            voice_notes: undefined,
          },
          arc_role: 'setup',
          tier_at_gen: 'premium',
          audio_mode: 'silent_tts',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-03: rising — 8s, Vika appears
        {
          scene_id: 'script-60s-03',
          description: 'Из тени выходит Вика — информатор Артёма.',
          description_ru:
            'Силуэт в тёмном капюшоне отделяется от стены. Вика выходит на свет фонаря — осторожно, быстро, оглядывается. Артём не удивлён.',
          description_en:
            'A silhouette in a dark hood steps away from the wall. Vika moves into the lamplight — cautious, quick, glancing back. Artyom is unsurprised.',
          duration_sec: 8,
          dialogue: { speaker: 'Вика', text: 'You got the note. Good.' },
          character_ids: ['Артём', 'Вика'],
          composition: {
            shot_size: 'medium',
            angle: 'eye_level',
            framing_notes: 'Вика слева выходит на свет, Артём справа в ожидании.',
            subject_focus: 'встреча Артёма и Вики',
          },
          camera_movement: {
            kind: 'handheld',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, лёгкое дыхание камеры',
          },
          lighting: {
            recipe: 'single practical key — warm amber + deep teal shadow fill',
            time_of_day: 'ночь',
            key_direction: 'сверху, фонарь между персонажами',
          },
          audio_direction: {
            ambient: 'дождь стихает, тишина',
            music: 'фортепиано, нарастающая напряжённость',
            sfx: ['шаги по мокрой брусчатке'],
            voice_notes: 'Вика — тихо, чётко, скупо',
          },
          arc_role: 'rising',
          tier_at_gen: 'premium',
          audio_mode: 'native',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-04: rising — 7s, Vika reveals information
        {
          scene_id: 'script-60s-04',
          description: 'Вика передаёт флеш-карту и называет имя.',
          description_ru:
            'Вика протягивает маленькую флеш-карту — в нескольких сантиметрах от руки Артёма. Она называет имя вполголоса. Артём берёт карту, лицо непроницаемо.',
          description_en:
            "Vika holds out a flash drive — inches from Artyom's hand. She names a name, barely above a whisper. Artyom takes the drive, face unreadable.",
          duration_sec: 7,
          dialogue: { speaker: 'Вика', text: 'Краснов. Third floor. Tonight.' },
          character_ids: ['Артём', 'Вика'],
          composition: {
            shot_size: 'close_up',
            angle: 'eye_level',
            framing_notes: 'Обмен между руками в центре кадра — детальный план.',
            subject_focus: 'флеш-карта и руки персонажей',
          },
          camera_movement: {
            kind: 'static',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, резкий план рук',
          },
          lighting: {
            recipe: 'hard side practical — amber key + teal rim',
            time_of_day: 'ночь',
            key_direction: 'слева, практический источник',
          },
          audio_direction: {
            ambient: 'тишина, далёкий гул города',
            music: 'бас-нота, затяжная',
            sfx: ['касание флеш-карты'],
            voice_notes: 'Вика — едва слышно, без интонации',
          },
          arc_role: 'rising',
          tier_at_gen: 'premium',
          audio_mode: 'native',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-05: rising — 8s, Artyom approaches the building
        {
          scene_id: 'script-60s-05',
          description: 'Артём подходит к зданию — третий этаж светится.',
          description_ru:
            'Артём выходит из переулка к старому административному зданию. На третьем этаже — единственное горящее окно. Он смотрит вверх, потом проверяет карман — флеш-карта на месте.',
          description_en:
            'Artyom emerges from the alley to face an old office building. Third floor — the only lit window. He looks up, then checks his pocket — flash drive still there.',
          duration_sec: 8,
          dialogue: null,
          character_ids: ['Артём'],
          composition: {
            shot_size: 'wide',
            angle: 'low_angle',
            framing_notes: 'Здание доминирует в кадре, Артём внизу маленький, окно светится.',
            subject_focus: 'Артём vs. здание',
          },
          camera_movement: {
            kind: 'tilt_up',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, вертикальный reveal здания',
          },
          lighting: {
            recipe: 'deep ambient night — single warm window key high up',
            time_of_day: 'ночь',
            key_direction: 'сверху, тёплое окно',
          },
          audio_direction: {
            ambient: 'ветер, далёкие сирены',
            music: 'нарастающий орк. мотив',
            sfx: ['шаги Артёма', 'ветер'],
            voice_notes: undefined,
          },
          arc_role: 'rising',
          tier_at_gen: 'premium',
          audio_mode: 'silent_tts',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-06: climax — 7s, confrontation on third floor
        {
          scene_id: 'script-60s-06',
          description: 'Артём врывается на третий этаж — но комната пуста.',
          description_ru:
            'Артём распахивает дверь кабинета. Свет горит. Стол перевёрнут. Бумаги на полу. Окно нараспашку — дождь влетает внутрь. Краснова нет.',
          description_en:
            'Artyom throws open the office door. Light on. Desk overturned. Papers on the floor. Window wide open — rain blowing in. Krasnov gone.',
          duration_sec: 7,
          dialogue: { speaker: 'narrator', text: 'Опоздал. Как всегда — на одну минуту.' },
          character_ids: ['Артём'],
          composition: {
            shot_size: 'medium_close_up',
            angle: 'eye_level',
            framing_notes: 'Артём в дверях, хаос комнаты за ним, открытое окно как escape.',
            subject_focus: 'Артём на пороге пустой комнаты',
          },
          camera_movement: {
            kind: 'handheld',
            speed: 'fast',
            lens_character: 'anamorphic 40mm, дрожание камеры',
          },
          lighting: {
            recipe: 'bare overhead fluorescent + rain-blue from open window',
            time_of_day: 'ночь',
            key_direction: 'сверху, флюоресцентный',
          },
          audio_direction: {
            ambient: 'порыв ветра с дождём через окно',
            music: 'оркестр — кульминация, медь',
            sfx: ['хлопок двери', 'шелест бумаг', 'дождь в комнате'],
            voice_notes: 'нарратор — тихо, с горечью',
          },
          arc_role: 'climax',
          tier_at_gen: 'premium',
          audio_mode: 'native',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-07: payoff — 8s, Artyom finds a final clue
        {
          scene_id: 'script-60s-07',
          description: 'На полу — конверт с адресом. Дело не закончено.',
          description_ru:
            'Артём медленно поднимает с пола конверт. Внутри — адрес и одна строка. Он сворачивает листок, убирает в карман. Выражение лица меняется: усталость уходит, остаётся только цель.',
          description_en:
            'Artyom slowly picks up an envelope from the floor. Inside — an address and one line. He folds the note, pockets it. Weariness leaves his face; only purpose remains.',
          duration_sec: 8,
          dialogue: null,
          character_ids: ['Артём'],
          composition: {
            shot_size: 'medium_close_up',
            angle: 'eye_level',
            framing_notes: 'Лицо Артёма — трансформация от усталости к решимости.',
            subject_focus: 'лицо Артёма с конвертом',
          },
          camera_movement: {
            kind: 'dolly_in',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, глубина резкости на глазах',
          },
          lighting: {
            recipe: 'warm single practical + cool window rim',
            time_of_day: 'ночь',
            key_direction: 'слева, настольная лампа',
          },
          audio_direction: {
            ambient: 'дождь снаружи стихает',
            music: 'тихое фортепиано, мотив надежды',
            sfx: ['шорох бумаги'],
            voice_notes: undefined,
          },
          arc_role: 'payoff',
          tier_at_gen: 'premium',
          audio_mode: 'silent_tts',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
        // scene-08: cta — 7s, Artyom exits into the city
        {
          scene_id: 'script-60s-08',
          description: 'Артём выходит из здания и растворяется в ночном городе.',
          description_ru:
            'Артём выходит из парадного, поднимает воротник, исчезает в потоке ночных прохожих. Камера остаётся — следит за удаляющимся силуэтом, пока дождь не смывает его из кадра.',
          description_en:
            'Artyom steps out of the entrance, raises his collar, and vanishes into the flow of night pedestrians. The camera holds — watching the retreating silhouette until rain washes it from frame.',
          duration_sec: 7,
          dialogue: { speaker: 'narrator', text: 'Город подождёт. Я не подожду.' },
          character_ids: ['Артём'],
          composition: {
            shot_size: 'wide',
            angle: 'high_angle',
            framing_notes: 'Артём внизу удаляется, город-река людей вокруг, дождь.',
            subject_focus: 'Артём уходит в ночь',
          },
          camera_movement: {
            kind: 'static',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, широкий финальный план',
          },
          lighting: {
            recipe: 'ambient city neon — teal and amber mix + rain gloss on streets',
            time_of_day: 'ночь',
            key_direction: 'равномерный неоновый ambient',
          },
          audio_direction: {
            ambient: 'городской шум, дождь, голоса вдали',
            music: 'финальная тема, уходит на ppp',
            sfx: ['шаги в толпе', 'дождь'],
            voice_notes: 'нарратор тихо, с финальной точкой',
          },
          arc_role: 'cta',
          tier_at_gen: 'premium',
          audio_mode: 'native',
          first_frame_source: 'auto_continuity',
          ...EMPTY_SCENE_VERSIONED,
        },
      ],
    },
  },
] as const;
