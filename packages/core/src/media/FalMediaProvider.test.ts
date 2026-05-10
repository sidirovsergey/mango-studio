import { fal } from '@fal-ai/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FalMediaProvider } from './FalMediaProvider';

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    queue: {
      submit: vi.fn(),
      status: vi.fn(),
      result: vi.fn(),
      cancel: vi.fn(),
    },
  },
}));

const queue = (
  fal as unknown as {
    queue: {
      submit: ReturnType<typeof vi.fn>;
      status: ReturnType<typeof vi.fn>;
      result: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
    };
  }
).queue;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FalMediaProvider.submitCharacterDossier', () => {
  it('queues a dossier job and returns handle', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-1' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    const handle = await provider.submitCharacterDossier(
      { prompt: 'p', model: 'fal-ai/nano-banana-pro', format: '16:9', quality: '1080p' },
      { user_id: 'u', project_id: 'p', character_id: 'c1' },
    );
    expect(handle.fal_request_id).toBe('req-1');
    expect(handle.model_used).toBe('fal-ai/nano-banana-pro');
    expect(queue.submit).toHaveBeenCalledWith(
      'fal-ai/nano-banana-pro',
      expect.objectContaining({ input: expect.objectContaining({ prompt: 'p' }) }),
    );
  });

  it('routes to /edit endpoint when image_refs provided', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-2' });
    const provider = new FalMediaProvider({
      apiKey: 'k',
      resolveImageUrl: async (a) => (a.kind === 'fal_passthrough' ? a.url : `signed:${a.path}`),
    });
    await provider.submitCharacterDossier(
      {
        prompt: 'edit',
        model: 'fal-ai/nano-banana-pro',
        format: '16:9',
        quality: '1080p',
        image_refs: [{ kind: 'fal_passthrough', url: 'https://x' }],
      },
      { user_id: 'u', project_id: 'p', character_id: 'c1' },
    );
    expect(queue.submit).toHaveBeenCalledWith('fal-ai/nano-banana-pro/edit', expect.any(Object));
  });
});

describe('FalMediaProvider.submitFirstFrame', () => {
  it('queues nano-banana with multi-image refs (uses /edit)', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-ff' });
    const provider = new FalMediaProvider({
      apiKey: 'k',
      resolveImageUrl: async (a) => (a.kind === 'fal_passthrough' ? a.url : ''),
    });
    const handle = await provider.submitFirstFrame(
      {
        prompt: 'first frame prompt',
        model: 'fal-ai/nano-banana-pro',
        aspect_ratio: '9:16',
        image_refs: [
          { kind: 'fal_passthrough', url: 'https://r1' },
          { kind: 'fal_passthrough', url: 'https://r2' },
        ],
      },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    expect(handle.fal_request_id).toBe('req-ff');
    const call = queue.submit.mock.calls[0]!;
    expect(call[0]).toBe('fal-ai/nano-banana-pro/edit');
    expect((call[1] as { input: { image_urls: string[] } }).input.image_urls).toEqual([
      'https://r1',
      'https://r2',
    ]);
    expect((call[1] as { input: { aspect_ratio: string } }).input.aspect_ratio).toBe('9:16');
  });

  it('uses text-to-image (no /edit) when no refs', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-ff2' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await provider.submitFirstFrame(
      { prompt: 'p', model: 'fal-ai/nano-banana-pro', aspect_ratio: '9:16' },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    expect(queue.submit.mock.calls[0]![0]).toBe('fal-ai/nano-banana-pro');
  });
});

describe('FalMediaProvider.submitSceneVideo', () => {
  it('queues image-to-video with first_frame ref + duration', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-v' });
    const provider = new FalMediaProvider({
      apiKey: 'k',
      resolveImageUrl: async (a) => (a.kind === 'fal_passthrough' ? a.url : ''),
    });
    await provider.submitSceneVideo(
      {
        prompt: 'video',
        model: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
        first_frame_ref: { kind: 'fal_passthrough', url: 'https://ff' },
        duration_sec: 5,
        aspect_ratio: '9:16',
      },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    const call = queue.submit.mock.calls[0]!;
    expect((call[1] as { input: Record<string, unknown> }).input).toMatchObject({
      prompt: 'video',
      image_url: 'https://ff',
      duration: 5,
      aspect_ratio: '9:16',
    });
  });
});

describe('FalMediaProvider.submitVoice', () => {
  it('queues TTS with voice_id and text', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-tts' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await provider.submitVoice(
      {
        text: 'Hello',
        voice_id: 'voice-x',
        tts_provider_model: 'fal-ai/elevenlabs/tts/multilingual-v2',
      },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    const call = queue.submit.mock.calls[0]!;
    expect(call[0]).toBe('fal-ai/elevenlabs/tts/multilingual-v2');
    expect((call[1] as { input: Record<string, unknown> }).input).toMatchObject({
      text: 'Hello',
      voice: 'voice-x',
    });
  });
});

describe('FalMediaProvider.submitFinalClipMux', () => {
  it('queues ffmpeg merge-audio-video with both URLs', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-mux' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await provider.submitFinalClipMux(
      { video_url: 'https://v', audio_url: 'https://a' },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    expect(queue.submit.mock.calls[0]![0]).toBe('fal-ai/ffmpeg-api/merge-audio-video');
  });
});

describe('FalMediaProvider.submitMasterConcat', () => {
  it('queues ffmpeg merge-videos with array of clip URLs', async () => {
    queue.submit.mockResolvedValueOnce({ request_id: 'req-cat' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await provider.submitMasterConcat(
      { clip_urls: ['https://1', 'https://2', 'https://3'] },
      { user_id: 'u', project_id: 'p', character_id: 'scene' },
    );
    const call = queue.submit.mock.calls[0]!;
    expect(call[0]).toBe('fal-ai/ffmpeg-api/merge-videos');
    expect((call[1] as { input: Record<string, unknown> }).input).toMatchObject({
      video_urls: ['https://1', 'https://2', 'https://3'],
    });
  });
});

describe('FalMediaProvider.getJobStatus / getJobResult', () => {
  it('maps fal status into typed status', async () => {
    queue.status.mockResolvedValueOnce({ status: 'IN_QUEUE' });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    const s = await provider.getJobStatus('req-1', 'm');
    expect(s.status).toBe('pending');
  });

  it('returns primary_url and last_frame_url when present', async () => {
    queue.result.mockResolvedValueOnce({
      data: { video: { url: 'https://video.mp4' }, last_frame_url: 'https://lf.png' },
      requestId: 'req-1',
      pricing: { total_cost_usd: 0.18 },
    });
    const provider = new FalMediaProvider({ apiKey: 'k' });
    const r = await provider.getJobResult('req-1', 'm');
    expect(r.primary_url).toBe('https://video.mp4');
    expect(r.last_frame_url).toBe('https://lf.png');
    expect(r.cost_usd).toBe(0.18);
  });
});

describe('FalMediaProvider.cancelJob', () => {
  it('calls fal.queue.cancel', async () => {
    queue.cancel.mockResolvedValueOnce(undefined);
    const provider = new FalMediaProvider({ apiKey: 'k' });
    await provider.cancelJob('req-1', 'm');
    expect(queue.cancel).toHaveBeenCalledWith('m', { requestId: 'req-1' });
  });
});
