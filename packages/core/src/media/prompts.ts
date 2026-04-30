type Style = '3d_pixar' | '2d_drawn' | 'clay_art'

interface CharacterForPrompt {
  name: string
  description: string
  appearance: {
    age?: string
    build?: string
    species?: string
    distinctive?: string[]
  }
  personality?: string
}

const STYLE_PREAMBLE: Record<Style, string> = {
  '3d_pixar':
    '3D Pixar-quality CGI rendering, soft volumetric lighting, expressive eyes, slight cartoon proportions, polished textures',
  '2d_drawn':
    '2D hand-drawn animation, clean line art, flat colors with subtle gradients, expressive linework',
  clay_art:
    'Clay stop-motion animation aesthetic, visible hand-crafted texture, slightly imperfect surfaces, warm tactile feel',
}

const STYLE_NAME: Record<Style, string> = {
  '3d_pixar': '3D Pixar',
  '2d_drawn': '2D hand-drawn',
  clay_art: 'Clay stop-motion',
}

function compileAppearance(a: CharacterForPrompt['appearance']): string {
  const parts: string[] = []
  if (a.species) parts.push(a.species)
  if (a.age) parts.push(`age ${a.age}`)
  if (a.build) parts.push(a.build)
  if (a.distinctive?.length) parts.push(`distinctive features: ${a.distinctive.join(', ')}`)
  return parts.join(', ')
}

export function buildDossierPrompt(char: CharacterForPrompt, style: Style): string {
  const appearance = compileAppearance(char.appearance)
  const personalityBlock = char.personality ? `\nPersonality: ${char.personality}.` : ''

  return `Strong rule: style — ${STYLE_NAME[style]}.

Character model sheet on PURE WHITE background, professional animation studio quality.
Compose multiple instances of the character in a single widescreen 16:9 image:
- Multiple facial expressions (joy, sadness, surprise, anger, neutral)
- Multiple body poses (standing, sitting, action pose, casual)
- Body part close-ups (face detail, hand gesture, distinctive feature)
- Each instance clearly separated, no overlapping
- Consistent character design across all instances

Character: ${char.name}.
Description: ${char.description}.
Appearance: ${appearance}.${personalityBlock}

Style preamble (applied to character only, NOT background):
${STYLE_PREAMBLE[style]}.

Background: pure white #FFFFFF, no environment, no shadows on background.
Lighting on character: even, professional studio lighting, soft key light.`
}
