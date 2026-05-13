/**
 * Few-shot examples for SCRIPT_SYSTEM_PROMPT — embedded as <example> blocks.
 * Each example is a JSON string that parses cleanly via ScriptGenSchema.
 *
 * Design principle (post-audit 2026-05-13):
 *   Each scene is a SELF-CONTAINED cinematic moment of ~10s. Internal beats
 *   live inside description_ru/description_en as `0–3s:` / `3–7s:` / `7–10s:`
 *   markers, NOT as separate scenes. Sub-10s scenes are reserved for rhythmic
 *   punctuation (hook spike, tail).
 *
 * 15s "Утренний кот"           — economy tier, 2 scenes (10s + 5s tail)
 * 60s "Космокот и потерянная звезда" — premium tier, 6 scenes × 10s
 */
export const SCRIPT_EXAMPLES = {
  fifteen_sec: JSON.stringify(
    {
      title: 'Утренний кот',
      tier: 'economy',
      visual_theme: {
        palette: ['#F4E4BC', '#3D2914', '#E8B86D'],
        lighting: 'soft golden-hour key + warm fill + cool rim',
        lens: '85mm shallow DOF',
        motion: 'locked-off + occasional slow dolly',
        mood: 'cozy',
        film_look: 'warm grain 16mm',
        avoid: ['harsh shadows', 'cool blue tones', 'fast cuts'],
      },
      narrator_voice: {
        tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
        persona:
          'Bright, mid-range female voice — General American — clear neutral timbre — quick tempo with crisp consonants — soprano range with bright top notes — energetic and upbeat baseline — slight vocal fry on declarative endings',
        stability: 0.65,
        similarity_boost: 0.75,
        style: 0.1,
        speed: 0.9,
      },
      characters: [
        {
          action: 'add',
          name: 'Барсик',
          description:
            'Рыжий полосатый кот, пушистый, с большими янтарными глазами. Лениво-грациозный, обожает солнечные пятна на полу.',
          appearance: {
            species: 'кот',
            age: 'взрослый',
            build: 'пухленький, пушистый',
            distinctive: ['рыжие полосы', 'янтарные глаза', 'белые лапки'],
          },
          personality: 'Флегматичный философ. Жизнь хороша, пока есть солнечный луч и миска.',
        },
      ],
      scenes: [
        {
          scene_id: 'scene-01',
          description:
            'Барсик просыпается в солнечном луче, мягко спрыгивает, шествует к миске и обнаруживает её пустой — смотрит в камеру с немым укором.',
          description_ru:
            'Утренний золотой луч прорезает занавеску и ложится на рыжий бок дремлющего Барсика. 0–3s: кот медленно щурится и тянет переднюю лапу. 3–7s: мягко спрыгивает с подоконника и беззвучно шествует на кухню, хвост поднят вертикально как восклицательный знак. 7–10s: наклоняется к миске — пусто. Смотрит в камеру с немым укором, одно ухо опускается.',
          description_en:
            'A golden morning beam pierces the curtain and falls on sleeping ginger Barsik. 0–3s: the cat slowly squints and stretches a front paw. 3–7s: silently drops from the windowsill and pads regally to the kitchen, tail held vertically like an exclamation mark. 7–10s: leans toward the bowl — empty. Looks into the camera with wordless reproach, one ear drops.',
          duration_sec: 10,
          dialogue: {
            speaker: 'narrator',
            text: 'Утро начинается с самого важного: проверки, не появилась ли еда волшебным образом.',
          },
          character_ids: ['Барсик'],
          composition: {
            shot_size: 'medium',
            angle: 'eye_level',
            framing_notes: 'кот в центре, путь от окна к миске читается одним кадром',
            subject_focus: 'Барсик и его утренний ритуал',
          },
          camera_movement: {
            kind: 'dolly_in',
            speed: 'slow',
            lens_character: '85mm f/1.8, тёплое боке на занавеске',
          },
          lighting: {
            recipe: 'soft golden-hour key + warm fill',
            time_of_day: 'раннее утро',
            key_direction: 'слева через окно',
          },
          audio_direction: {
            ambient: 'тихое чириканье воробьёв за окном, тиканье часов на кухне',
            music: 'нежное пианино C-мажор, pianissimo, нарастает к середине',
            sfx: ['потягивание кота', 'мягкие шаги по паркету', 'звон пустой миски'],
            voice_notes: 'нарратор тепло, с улыбкой; пауза перед «волшебным образом»',
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
        {
          scene_id: 'scene-02',
          description:
            'Барсик возвращается к подоконнику, сворачивается клубком в солнечном пятне и жмурится. Завтрак подождёт.',
          description_ru:
            'Убедившись, что еда не появилась, Барсик возвращается к подоконнику, сворачивается клубком прямо в солнечном пятне и жмурится. Хвост укрывает нос. Лёгкое мурлыканье.',
          description_en:
            'Satisfied that food has not appeared, Barsik returns to the windowsill, curls up in the sunspot and squints contentedly. His tail covers his nose. A soft purr.',
          duration_sec: 5,
          dialogue: { speaker: 'narrator', text: 'Солнце никуда не делось. День удался.' },
          character_ids: ['Барсик'],
          composition: {
            shot_size: 'medium_close_up',
            angle: 'eye_level',
            framing_notes: 'кот в клубке в правой трети, размытый силуэт города в окне',
            subject_focus: 'Барсик, свернувшийся в клубок',
          },
          camera_movement: {
            kind: 'dolly_out',
            speed: 'slow',
            lens_character: '85mm, тёплая виньетка по краям',
          },
          lighting: {
            recipe: 'soft golden-hour key + warm fill',
            time_of_day: 'утро, чуть позже',
            key_direction: 'слева, чуть ярче чем в первой сцене',
          },
          audio_direction: {
            ambient: 'далёкий городской гул, птицы',
            music: 'пианино — финальный аккорд',
            sfx: ['мурлыканье'],
            voice_notes: 'нарратор тепло, с финальной точкой',
          },
          arc_role: 'payoff',
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
      ],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    },
    null,
    2,
  ),

  sixty_sec: JSON.stringify(
    {
      title: 'Космокот и потерянная звезда',
      tier: 'premium',
      visual_theme: {
        palette: ['#0A1628', '#3D5B7A', '#8A6FD8', '#E4B863'],
        lighting: 'rim-heavy with bioluminescent fills',
        lens: 'anamorphic 40mm',
        motion: 'floating handheld + crane reveals',
        mood: 'wondrous',
        film_look: 'anamorphic lens flares, deep blacks, teal-violet grade',
        avoid: ['warm yellows as dominants', 'locked-off static shots', 'flat lighting'],
      },
      narrator_voice: {
        tts_voice_id: 'pNInz6obpgDQGcFmaJgB',
        persona:
          'Soft, mid-range female voice — General American — slightly breathy timbre — medium tempo with thoughtful pauses — mid-tenor pitch with warm range — calm and curious baseline — drags out vowels on key words',
        stability: 0.7,
        similarity_boost: 0.8,
        style: 0.15,
        speed: 0.85,
      },
      characters: [
        {
          action: 'add',
          name: 'Космокот',
          description:
            'Тёмно-синий кот с мерцающими звёздами в шерсти, большими фиолетовыми глазами. Носит маленький скафандр с открытым шлемом. Смелый, любопытный, немного растерянный.',
          appearance: {
            species: 'кот',
            age: 'молодой взрослый',
            build: 'стройный, грациозный',
            distinctive: [
              'звёзды в шерсти',
              'фиолетовые глаза',
              'скафандр с открытым шлемом',
              'светящийся хвост',
            ],
          },
          personality:
            'Бесстрашный исследователь с мягким сердцем. Никогда не оставит друга в беде.',
        },
        {
          action: 'add',
          name: 'Искра',
          description:
            'Маленький дух потерянной звезды — светящийся шарик золотистого света с тонкими лучиками-ручками. Пугливая, одинокая, но искренняя.',
          appearance: {
            species: 'звёздный дух',
            age: 'юный',
            build: 'крошечный, невесомый',
            distinctive: ['золотистое свечение', 'тонкие лучи вместо рук', 'мерцает когда рада'],
          },
          personality: 'Робкая, но любопытная. Тоскует по своему созвездию.',
        },
      ],
      scenes: [
        {
          scene_id: 'scene-01',
          description:
            'Космокот мчится сквозь звёздное поле на ракетном самокате, замечает темноту вместо звезды и резко тормозит.',
          description_ru:
            'Чёрный бархат космоса. 0–3s: Космокот мчится на крошечном ракетном самокате, его шерсть переливается — каждая звезда в ней отражает настоящее небо. 3–7s: неожиданно принюхивается, прищуривается; ракетный выхлоп гаснет. 7–10s: самокат резко тормозит. На звёздной карте — яркая точка, в небе — пустота, лишь золотистое мерцание на краю темноты.',
          description_en:
            'Black velvet of space. 0–3s: Cosmocat rockets on a tiny scooter, his fur shimmering — each star in it mirrors the real sky. 3–7s: he sniffs the air suddenly, narrows his eyes; the rocket exhaust dims. 7–10s: the scooter brakes sharply. The star map shows a bright dot — the sky shows emptiness, only a faint golden shimmer at the edge.',
          duration_sec: 10,
          dialogue: {
            speaker: 'narrator',
            text: 'На краю Галактики Мурлыканья что-то было не так с созвездием Рыбьего Хвоста.',
          },
          character_ids: ['Космокот'],
          composition: {
            shot_size: 'wide',
            angle: 'low_angle',
            framing_notes:
              'кот снизу в перспективе, звёздное поле уходит вглубь, ракетный след диагональю',
            subject_focus: 'Космокот на самокате против пустоты',
          },
          camera_movement: {
            kind: 'tracking',
            speed: 'medium',
            lens_character: 'anamorphic 40mm, горизонтальные блики на звёздах',
          },
          lighting: {
            recipe: 'deep cosmic rim + starfield ambient',
            time_of_day: 'открытый космос',
            key_direction: 'слева, холодный синий',
          },
          audio_direction: {
            ambient: 'глубокий гул космоса, низкий дрон, к финалу — тишина',
            music: 'оркестр приключения нарастает, на торможении — резко обрывается',
            sfx: ['гудение ракетного двигателя', 'свист сквозь пространство', 'скрип тормозов'],
            voice_notes:
              'нарратор торжественно вначале, на финальной фразе — заговорщически тише; пауза перед «было не так»',
          },
          arc_role: 'hook',
          tier_at_gen: 'premium',
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
        {
          scene_id: 'scene-02',
          description:
            'Из темноты выплывает крошечная дрожащая Искра. Космокот осторожно подплывает и протягивает лапу.',
          description_ru:
            '0–3s: из темноты выплывает крошечный светящийся шарик — Искра, дрожит и почти не светится. 3–7s: Космокот осторожно подплывает к ней на самокате, замедляется, останавливается. 7–10s: медленно протягивает лапу. Искра жмётся к астероиду, потом несмело отвечает мягким лучиком.',
          description_en:
            '0–3s: from the darkness drifts a tiny glowing orb — Iskra, trembling, barely luminous. 3–7s: Cosmocat carefully glides toward her on his scooter, slowing, stopping. 7–10s: he slowly extends a paw. Iskra huddles against an asteroid, then shyly answers with a soft ray.',
          duration_sec: 10,
          dialogue: { speaker: 'Космокот', text: 'Эй... ты не потерялась?' },
          character_ids: ['Космокот', 'Искра'],
          composition: {
            shot_size: 'medium',
            angle: 'eye_level',
            framing_notes:
              'двое в кадре: кот справа крупнее, Искра слева меньше и тусклее; пространство дышит',
            subject_focus: 'встреча Космокота и Искры',
          },
          camera_movement: {
            kind: 'dolly_in',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, мягкое боке на астероиде',
          },
          lighting: {
            recipe: 'bioluminescent fill from Iskra + cold star rim',
            time_of_day: 'открытый космос',
            key_direction: 'Искра — точечный источник слева',
          },
          audio_direction: {
            ambient: 'тишина пронизывает кадр',
            music: 'одинокая флейта переходит в нежную тему знакомства',
            sfx: ['лёгкое мерцание Искры', 'тихий выдох Космокота'],
            voice_notes:
              'Космокот шёпотом, очень бережно; пауза в многоточии — настоящая, не выдыхай скороговоркой',
          },
          arc_role: 'setup',
          tier_at_gen: 'premium',
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
        {
          scene_id: 'scene-03',
          description:
            'Искра рассказывает, что её сдул Большой Ветер. Космокот слушает и решает помочь — берёт её под лапу.',
          description_ru:
            '0–4s: Искра мерцает, пытаясь объяснить; её лучики-ручки показывают направление, откуда дул страшный ветер. 4–8s: Космокот слушает серьёзно, уши прижаты вперёд, в глазах — решимость. 8–10s: он бережно берёт Искру под лапу как хрустальный шар. Искра светится чуть ярче.',
          description_en:
            '0–4s: Iskra flickers, trying to explain; her ray-arms point toward where the terrible wind blew from. 4–8s: Cosmocat listens seriously, ears pricked forward, eyes filling with resolve. 8–10s: he tucks Iskra gently under his paw, cradling her like a crystal ball. Iskra glows a little brighter.',
          duration_sec: 10,
          dialogue: { speaker: 'Искра', text: 'Большой Ветер... он меня унёс далеко-далеко.' },
          character_ids: ['Космокот', 'Искра'],
          composition: {
            shot_size: 'close_up',
            angle: 'low_angle',
            framing_notes:
              'Искра в центре кадра, снизу — выглядит уязвимо; Космокот сначала за кадром, в финале — лапа входит в кадр',
            subject_focus: 'рассказ Искры и решение Космокота',
          },
          camera_movement: {
            kind: 'handheld',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, лёгкое дыхание камеры',
          },
          lighting: {
            recipe: 'Iskra glow as key, deep space fill',
            time_of_day: 'открытый космос',
            key_direction: 'Искра — центр кадра как источник',
          },
          audio_direction: {
            ambient: 'далёкий звук ветра в пространстве',
            music: 'тихий струнный орнамент с восходящей нотой к решению',
            sfx: ['мерцание Искры', 'отзвук ветра', 'тихий хлопок лапы'],
            voice_notes:
              'Искра дрожащим голосом, медленно, с настоящей паузой в многоточии; ясная артикуляция',
          },
          arc_role: 'rising',
          tier_at_gen: 'premium',
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
        {
          scene_id: 'scene-04',
          description:
            'Они мчатся к созвездию сквозь метеоритный дождь. Путь блокирует Тёмный Вихрь — космический шторм.',
          description_ru:
            '0–3s: самокат на максимальной тяге пробивает метеоритный дождь; Искра под лапой Космокота светится ярче. 3–7s: впереди разверзается чёрная воронка Тёмного Вихря; Искра гаснет от страха, самокат трясёт. 7–10s: Космокот встаёт на корму самоката и смотрит в пасть шторма — звёзды в его шерсти пылают ярко.',
          description_en:
            "0–3s: the scooter punches through a meteor shower at full thrust; Iskra glows brighter under Cosmocat's paw. 3–7s: ahead, the black funnel of the Dark Vortex tears open; Iskra goes dark with fear, the scooter shakes. 7–10s: Cosmocat stands on the scooter's back end and stares into the storm's maw — the stars in his fur blaze bright.",
          duration_sec: 10,
          dialogue: {
            speaker: 'narrator',
            text: 'Но путь домой преграждал Тёмный Вихрь — и он был огромен.',
          },
          character_ids: ['Космокот', 'Искра'],
          composition: {
            shot_size: 'extreme_wide',
            angle: 'low_angle',
            framing_notes:
              'Вихрь занимает 70% кадра сверху, самокат крошечный внизу по центру — контраст масштаба',
            subject_focus: 'Космокот против Тёмного Вихря',
          },
          camera_movement: {
            kind: 'crane_up',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, вертикальный reveal вихря',
          },
          lighting: {
            recipe: 'void dark key + lightning flash fills + Cosmocat star-glow counter-rim',
            time_of_day: 'открытый космос',
            key_direction: 'тёмный верх, свет снизу от кота',
          },
          audio_direction: {
            ambient: 'инфразвук вихря, давящий, нарастает',
            music: 'оркестр — тема опасности, медь и ударные, на «огромен» — внезапная тишина',
            sfx: ['рёв вихря', 'вибрация самоката', 'удары метеоритов', 'потрескивание молний'],
            voice_notes: 'нарратор весомо, медленно; пауза после слова «огромен», тяжёлая',
          },
          arc_role: 'climax',
          tier_at_gen: 'premium',
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
        {
          scene_id: 'scene-05',
          description:
            'Космокот поднимает Искру к вихрю; она вспыхивает золотым лучом и рассеивает шторм.',
          description_ru:
            '0–3s: Космокот поднимает Искру на вытянутых лапах высоко над головой; Искра ловит его взгляд. 3–7s: Искра понимает — и вспыхивает; золотой луч пронзает воронку. 7–10s: вихрь дрожит, кричит, рассыпается в серебряную пыль. Впереди — открытое созвездие Рыбьего Хвоста.',
          description_en:
            '0–3s: Cosmocat lifts Iskra high above his head on outstretched paws; Iskra meets his gaze. 3–7s: Iskra understands — and blazes; a golden beam pierces the funnel. 7–10s: the vortex shudders, screams, dissolves into silver dust. Ahead — the open Fish-Tail constellation.',
          duration_sec: 10,
          dialogue: { speaker: 'Искра', text: 'Я... я помню, кто я!' },
          character_ids: ['Космокот', 'Искра'],
          composition: {
            shot_size: 'medium',
            angle: 'low_angle',
            framing_notes:
              'Кот держит Искру над головой, золотой луч уходит вверх; вихрь рассыпается по краям',
            subject_focus: 'вспышка Искры разгоняет вихрь',
          },
          camera_movement: {
            kind: 'crane_up',
            speed: 'medium',
            lens_character: 'anamorphic 40mm, лёгкая засветка от Искры',
          },
          lighting: {
            recipe: 'Iskra blast key — warm gold, vortex dissolution fills — silver flash',
            time_of_day: 'открытый космос',
            key_direction: 'Искра сверху центр как точечный взрыв',
          },
          audio_direction: {
            ambient: 'вихрь стихает, после вспышки — звенящая тишина',
            music: 'оркестр взрывается в мажоре, затем переходит в тихий хор',
            sfx: ['вспышка Искры', 'рёв вихря затихает', 'звон рассыпающихся частиц'],
            voice_notes:
              'Искра — с удивлением и радостью; первое «я» — почти шёпот, второе — уверенно',
          },
          arc_role: 'payoff',
          tier_at_gen: 'premium',
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
        {
          scene_id: 'scene-06',
          description:
            'Искра занимает своё место в созвездии. Космокот смотрит, улыбается и улетает к следующей истории.',
          description_ru:
            '0–3s: Искра занимает своё место в созвездии Рыбьего Хвоста — оно вспыхивает полным светом, разливая золото по кадру. 3–7s: Космокот смотрит на неё, улыбается — ухо вверх, хвост дугой; в его глазах отражается созвездие. 7–10s: разворачивает самокат и уносится в глубину звёздного поля, оставляя золотой след.',
          description_en:
            '0–3s: Iskra takes her place in the Fish-Tail constellation — it blazes back to full brightness, golden light spilling across the frame. 3–7s: Cosmocat watches her, smiles — ear up, tail arched; the constellation reflects in his eyes. 7–10s: he turns his scooter and rockets back into the depths of the star field, leaving a golden trail.',
          duration_sec: 10,
          dialogue: {
            speaker: 'narrator',
            text: 'Так Космокот вернул звезду домой. А потом полетел туда, где ждала следующая история.',
          },
          character_ids: ['Космокот', 'Искра'],
          composition: {
            shot_size: 'wide',
            angle: 'high_angle',
            framing_notes:
              'созвездие сверху полным светом, самокат внизу удаляется в глубину кадра',
            subject_focus: 'возвращение Искры домой + уход Космокота',
          },
          camera_movement: {
            kind: 'crane_down',
            speed: 'slow',
            lens_character: 'anamorphic 40mm, финальные блики на созвездии',
          },
          lighting: {
            recipe: 'constellation full-bright key + deep space ambient',
            time_of_day: 'открытый космос',
            key_direction: 'сверху — свет созвездия',
          },
          audio_direction: {
            ambient: 'мягкий космический хор',
            music: 'полная оркестровая тема, победная, плавно стихает к финальному аккорду',
            sfx: ['мурлыканье Космокота вдалеке', 'звон созвездия'],
            voice_notes:
              'нарратор тепло, с финальной интонацией; пауза после «домой» — небольшая, тёплая',
          },
          arc_role: 'cta',
          tier_at_gen: 'premium',
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
      ],
      master_clip_versions: [],
      master_clip_active_version_id: null,
    },
    null,
    2,
  ),
};
