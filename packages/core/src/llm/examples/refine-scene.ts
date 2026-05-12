/**
 * Few-shot examples for REFINE_SYSTEM_PROMPT — embedded as <example> blocks.
 * Each example demonstrates that the LLM must echo unchanged fields verbatim
 * and only update the fields explicitly requested by the user's instruction.
 *
 * tone_change      — instruction changes tone/time-of-day: only description + lighting + audio updated
 * composition_change — instruction changes shot size: only composition.shot_size updated
 */

const TONE_CHANGE_INPUT_SCENE = JSON.stringify(
  {
    scene_id: 'scene-01',
    description: 'Кот лежит на подоконнике.',
    description_ru: 'Кот лежит на подоконнике.',
    description_en: 'The cat lies on the windowsill.',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['Барсик'],
    composition: {
      shot_size: 'medium',
      angle: 'eye_level',
      framing_notes: 'Кот по центру, окно за ним.',
      subject_focus: 'Барсик на подоконнике',
    },
    camera_movement: {
      kind: 'static',
      speed: 'slow',
      lens_character: '85mm мягкое боке',
    },
    lighting: {
      recipe: 'soft golden hour',
      time_of_day: 'утро',
      key_direction: 'слева через окно',
    },
    audio_direction: {
      ambient: 'тихое чириканье воробьёв',
      music: 'нежное пианино',
      sfx: [],
    },
    arc_role: 'hook',
    tier_at_gen: 'economy',
    audio_mode: 'auto',
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  },
  null,
  2,
);

const TONE_CHANGE_OUTPUT_SCENE = JSON.stringify(
  {
    scene_id: 'scene-01',
    description: 'Кот напряжённо смотрит в ночную тьму за окном.',
    description_ru: 'Кот напряжённо смотрит в ночную тьму за окном.',
    description_en: 'The cat stares tensely into the dark night outside the window.',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['Барсик'],
    composition: {
      shot_size: 'medium',
      angle: 'eye_level',
      framing_notes: 'Кот по центру, окно за ним.',
      subject_focus: 'Барсик на подоконнике',
    },
    camera_movement: {
      kind: 'static',
      speed: 'slow',
      lens_character: '85mm мягкое боке',
    },
    lighting: {
      recipe: 'moonlit rim + deep shadow fill',
      time_of_day: 'ночь',
      key_direction: 'слева через окно',
    },
    audio_direction: {
      ambient: 'тишина, далёкий вой ветра',
      music: 'низкий струнный дрон',
      sfx: [],
    },
    arc_role: 'hook',
    tier_at_gen: 'economy',
    audio_mode: 'auto',
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  },
  null,
  2,
);

const COMPOSITION_CHANGE_INPUT_SCENE = JSON.stringify(
  {
    scene_id: 'scene-02',
    description: 'Кот смотрит на пустую миску.',
    description_ru: 'Кот смотрит на пустую миску.',
    description_en: 'The cat looks at the empty bowl.',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['Барсик'],
    composition: {
      shot_size: 'medium',
      angle: 'eye_level',
      framing_notes: 'Кот и миска в кадре.',
      subject_focus: 'Барсик у миски',
    },
    camera_movement: {
      kind: 'static',
      speed: 'slow',
      lens_character: '85mm',
    },
    lighting: {
      recipe: 'warm fill',
      time_of_day: 'утро',
      key_direction: 'справа',
    },
    audio_direction: {
      ambient: 'тиканье часов',
      music: 'пианино pianissimo',
      sfx: ['звон пустой миски'],
    },
    arc_role: 'rising',
    tier_at_gen: 'economy',
    audio_mode: 'auto',
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  },
  null,
  2,
);

const COMPOSITION_CHANGE_OUTPUT_SCENE = JSON.stringify(
  {
    scene_id: 'scene-02',
    description: 'Кот смотрит на пустую миску.',
    description_ru: 'Кот смотрит на пустую миску.',
    description_en: 'The cat looks at the empty bowl.',
    duration_sec: 5,
    dialogue: null,
    character_ids: ['Барсик'],
    composition: {
      shot_size: 'extreme_close_up',
      angle: 'eye_level',
      framing_notes: 'Кот и миска в кадре.',
      subject_focus: 'Барсик у миски',
    },
    camera_movement: {
      kind: 'static',
      speed: 'slow',
      lens_character: '85mm',
    },
    lighting: {
      recipe: 'warm fill',
      time_of_day: 'утро',
      key_direction: 'справа',
    },
    audio_direction: {
      ambient: 'тиканье часов',
      music: 'пианино pianissimo',
      sfx: ['звон пустой миски'],
    },
    arc_role: 'rising',
    tier_at_gen: 'economy',
    audio_mode: 'auto',
    first_frame_source: 'auto_continuity',
    first_frame_versions: [],
    first_frame_active_version_id: null,
    video_versions: [],
    video_active_version_id: null,
    voice_audio_versions: [],
    voice_audio_active_version_id: null,
    last_frame: null,
    final_clip: null,
  },
  null,
  2,
);

const VISUAL_THEME_EXAMPLE = JSON.stringify({
  palette: ['#F4E4BC', '#3D2914', '#E8B86D'],
  lighting: 'soft golden-hour key + warm fill',
  lens: '85mm shallow DOF',
  motion: 'locked-off',
  mood: 'cozy',
});

/**
 * Each example is a wrapped XML <example> block ready for embedding in REFINE_SYSTEM_PROMPT.
 * The LLM sees input (visual_theme + current scene + instruction) and must produce output
 * that changes ONLY the fields the instruction targets — echoing all other fields verbatim.
 */
export const REFINE_EXAMPLES = {
  tone_change: `<example>
<input>
  <visual_theme>${VISUAL_THEME_EXAMPLE}</visual_theme>
  <current>${TONE_CHANGE_INPUT_SCENE}</current>
  <instruction>сделай страшнее, ночью</instruction>
</input>
<output>
${TONE_CHANGE_OUTPUT_SCENE}
</output>
</example>`,

  composition_change: `<example>
<input>
  <visual_theme>${VISUAL_THEME_EXAMPLE}</visual_theme>
  <current>${COMPOSITION_CHANGE_INPUT_SCENE}</current>
  <instruction>сделай это extreme close-up</instruction>
</input>
<output>
${COMPOSITION_CHANGE_OUTPUT_SCENE}
</output>
</example>`,
};
